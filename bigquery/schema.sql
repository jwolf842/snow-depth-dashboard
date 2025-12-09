-- Snow Depth Dashboard - BigQuery Schema
-- ========================================

-- Create dataset (run in BigQuery console)
CREATE SCHEMA IF NOT EXISTS snow_data;

-- Create observations table
CREATE TABLE IF NOT EXISTS snow_data.observations (
  date DATE,
  station STRING,
  station_id STRING,
  state STRING,
  snow_depth_in INTEGER,
  water_year INTEGER,
  day_of_wy INTEGER,
  month STRING,
  month_num INTEGER,
  is_current_wy BOOL,
  last_updated TIMESTAMP,
  source STRING,
  month_rank INTEGER
);

-- ========================================
-- DATA NORMALIZATION QUERIES
-- ========================================

-- Normalize month names to 3-letter abbreviations
UPDATE snow_data.observations
SET month = CASE month
  WHEN 'January' THEN 'Jan'
  WHEN 'February' THEN 'Feb'
  WHEN 'March' THEN 'Mar'
  WHEN 'April' THEN 'Apr'
  WHEN 'May' THEN 'May'
  WHEN 'June' THEN 'Jun'
  WHEN 'July' THEN 'Jul'
  WHEN 'August' THEN 'Aug'
  WHEN 'September' THEN 'Sep'
  WHEN 'October' THEN 'Oct'
  WHEN 'November' THEN 'Nov'
  WHEN 'December' THEN 'Dec'
  ELSE month
END
WHERE month IN ('January', 'February', 'March', 'April', 'May', 'June', 
                'July', 'August', 'September', 'October', 'November', 'December');

-- Normalize station names (remove CDEC suffix, merge with existing)
UPDATE snow_data.observations
SET station = CASE station
  WHEN 'Donner Memorial SP (CDEC)' THEN 'Donner Summit'
  WHEN 'Mammoth Pass (CDEC)' THEN 'Mammoth Pass'
  WHEN 'Blue Canyon (CDEC)' THEN 'Blue Canyon'
  WHEN 'Leavitt Meadows (CDEC)' THEN 'Leavitt Meadows'
  WHEN 'Poison Flat (CDEC)' THEN 'Poison Flat'
  WHEN 'Rock Creek (CDEC)' THEN 'Rock Creek'
  ELSE station
END
WHERE station LIKE '%(CDEC)%';

-- ========================================
-- MONTH RANK CALCULATION
-- ========================================

-- Recalculate month_rank after data updates
-- Step 1: Drop existing column
ALTER TABLE snow_data.observations DROP COLUMN IF EXISTS month_rank;

-- Step 2: Recreate table with calculated rank
CREATE OR REPLACE TABLE snow_data.observations AS
SELECT o.*,
  r.month_rank
FROM snow_data.observations o
JOIN (
  SELECT station, month_num, water_year,
    RANK() OVER (PARTITION BY station, month_num ORDER BY SUM(snow_depth_in) DESC) AS month_rank
  FROM snow_data.observations
  GROUP BY station, month_num, water_year
) r
ON o.station = r.station 
  AND o.month_num = r.month_num 
  AND o.water_year = r.water_year;

-- ========================================
-- UTILITY QUERIES
-- ========================================

-- Remove duplicate records
DELETE FROM snow_data.observations
WHERE STRUCT(date, station, station_id) IN (
  SELECT STRUCT(date, station, station_id)
  FROM (
    SELECT date, station, station_id,
      ROW_NUMBER() OVER (PARTITION BY date, station, station_id ORDER BY last_updated DESC) AS rn
    FROM snow_data.observations
  )
  WHERE rn > 1
);

-- View record counts by source
SELECT source, COUNT(*) as records
FROM snow_data.observations
GROUP BY source
ORDER BY records DESC;

-- View record counts by station
SELECT station, state, source, COUNT(*) as records
FROM snow_data.observations
GROUP BY station, state, source
ORDER BY records DESC;

-- View current water year stats
SELECT station, 
  MAX(snow_depth_in) as max_depth,
  AVG(snow_depth_in) as avg_depth,
  COUNT(*) as days_recorded
FROM snow_data.observations
WHERE is_current_wy = TRUE
GROUP BY station
ORDER BY max_depth DESC;
