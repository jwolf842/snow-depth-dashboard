/**
 * Additional Snow Data Sources Integration
 * =========================================
 * Adds California CDEC and SnoCountry ski resort data to the unified Snow Data sheet.
 * 
 * SOURCES:
 * 1. California CDEC - State-run snow sensors (CA only, complements SNOTEL)
 * 2. SnoCountry - Ski resort reported snow depths (user-reported, nationwide)
 */

// ============================================================================
// CALIFORNIA CDEC CONFIGURATION
// ============================================================================

/**
 * CDEC Snow Sensor Stations
 * Find more at: https://cdec.water.ca.gov/snow/current/snow/index.html
 * Sensor codes: https://cdec.water.ca.gov/misc/senslist.html
 * Snow Depth sensor = 18
 */
const CDEC_STATIONS = {
  // Northern Sierra
  'Blue Canyon': { id: 'BLC', elevation: 5280 },
  'Tahoe City Cross': { id: 'TAC', elevation: 6230 },
  'Echo Peak': { id: 'ECP', elevation: 7800 },
  'Caples Lake': { id: 'CPL', elevation: 7920 },
  
  // Central Sierra  
  'Poison Flat': { id: 'PSN', elevation: 7920 },
  'Leavitt Meadows': { id: 'LVM', elevation: 7150 },
  'Sonora Pass': { id: 'SNP', elevation: 9200 },
  
  // Southern Sierra
  'Mammoth Pass': { id: 'MHP', elevation: 9300 },
  'Rock Creek': { id: 'RCK', elevation: 9500 },
  'Bishop Pass': { id: 'BSP', elevation: 10500 },
  
  // Mt Shasta Area
  'Mt Shasta': { id: 'MSS', elevation: 5800 }
};

// ============================================================================
// SNOCOUNTRY CONFIGURATION
// ============================================================================

/**
 * SnoCountry uses state codes to fetch resort data
 * Free API returns up to 3 resorts with example key
 * For full access, request key at: https://feeds.snocountry.net/
 */
const SNOCOUNTRY_API_KEY = 'SnoCountry.example';  // Replace with your key for full access

// States to fetch resort data from
const SNOCOUNTRY_STATES = ['VT', 'NH', 'ME', 'NY', 'CO', 'UT', 'CA', 'WA', 'OR', 'MT', 'WY', 'ID'];

// ============================================================================
// MENU SETUP
// ============================================================================

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🎿 Additional Sources')
    .addItem('Setup CDEC Stations', 'setupCDECStations')
    .addItem('Fetch CDEC Historical Data', 'fetchCDECHistoricalData')
    .addItem('Daily CDEC Update', 'dailyCDECUpdate')
    .addSeparator()
    .addItem('Fetch SnoCountry Resort Data', 'fetchSnoCountryData')
    .addItem('Daily SnoCountry Update', 'dailySnoCountryUpdate')
    .addSeparator()
    .addItem('Create Additional Sources Trigger', 'createAdditionalSourcesTrigger')
    .addToUi();
}

// ============================================================================
// CDEC INTEGRATION
// ============================================================================

/**
 * Adds CDEC stations to the unified Stations sheet
 */
function setupCDECStations() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let stationsSheet = ss.getSheetByName('Stations');
  
  if (!stationsSheet) {
    SpreadsheetApp.getUi().alert('Run SNOTEL setupSheets() first to create the Stations sheet.');
    return;
  }
  
  // Get existing station names to avoid duplicates
  const existingData = stationsSheet.getDataRange().getValues();
  const existingNames = new Set(existingData.slice(1).map(row => row[0]));
  
  // Build rows for CDEC stations
  const newRows = [];
  for (const [name, config] of Object.entries(CDEC_STATIONS)) {
    const stationName = `${name} (CDEC)`;
    if (!existingNames.has(stationName)) {
      newRows.push([
        stationName,
        `CDEC:${config.id}`,
        'CA',
        'CDEC',
        config.elevation,
        '',  // HYD_Site (not applicable)
        '',  // HYD_Search (not applicable)
        true
      ]);
    }
  }
  
  // Append new stations
  if (newRows.length > 0) {
    const lastRow = stationsSheet.getLastRow();
    stationsSheet.getRange(lastRow + 1, 1, newRows.length, 8).setValues(newRows);
  }
  
  Logger.log(`Added ${newRows.length} CDEC stations`);
  SpreadsheetApp.getUi().alert(`Added ${newRows.length} CDEC stations to Stations sheet.`);
}

/**
 * Fetches historical snow depth data from CDEC
 * CDEC provides daily data via CSV export
 */
function fetchCDECHistoricalData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const stationsSheet = ss.getSheetByName('Stations');
  const dataSheet = ss.getSheetByName('Snow Data');
  
  if (!stationsSheet || !dataSheet) {
    SpreadsheetApp.getUi().alert('Run setup first.');
    return;
  }
  
  // Get active CDEC stations
  const stationData = stationsSheet.getDataRange().getValues();
  const stations = [];
  for (let i = 1; i < stationData.length; i++) {
    if (stationData[i][3] === 'CDEC' && stationData[i][7] === true) {
      const idMatch = stationData[i][1].match(/CDEC:(\w+)/);
      if (idMatch) {
        stations.push({
          name: stationData[i][0],
          id: idMatch[1],
          state: stationData[i][2]
        });
      }
    }
  }
  
  Logger.log(`Fetching CDEC data for ${stations.length} stations`);
  
  // Calculate date range (10 years back)
  const endDate = new Date();
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 10);
  
  const allRows = [];
  
  for (const station of stations) {
    Logger.log(`Processing ${station.name}...`);
    
    try {
      const data = fetchCDECData(station.id, startDate, endDate);
      
      if (data && data.length > 0) {
        for (const record of data) {
          if (record.snowDepth !== null && record.snowDepth >= 0) {
            const date = record.date;
            const waterYear = date.getMonth() >= 9 ? date.getFullYear() + 1 : date.getFullYear();
            const wyStart = new Date(waterYear - 1, 9, 1);
            const dayOfWY = Math.floor((date - wyStart) / (1000 * 60 * 60 * 24)) + 1;
            const currentWY = getCurrentWaterYear();
            
            allRows.push([
              Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
              station.name,
              `CDEC:${station.id}`,
              station.state,
              record.snowDepth,
              waterYear,
              dayOfWY,
              Utilities.formatDate(date, Session.getScriptTimeZone(), 'MMM'),
              date.getMonth() + 1,
              waterYear === currentWY,
              new Date().toISOString(),
              'CDEC'
            ]);
          }
        }
        Logger.log(`  Got ${data.length} records`);
      }
    } catch (e) {
      Logger.log(`  Error: ${e.message}`);
    }
    
    Utilities.sleep(500);  // Rate limiting
  }
  
  // Write data
  if (allRows.length > 0) {
    const lastRow = dataSheet.getLastRow();
    dataSheet.getRange(lastRow + 1, 1, allRows.length, 12).setValues(allRows);
    Logger.log(`Wrote ${allRows.length} CDEC records`);
  }
  
  SpreadsheetApp.getUi().alert(`CDEC Historical Data Loaded\n${allRows.length} records from ${stations.length} stations.`);
}

/**
 * Fetches data from CDEC for a single station
 * Sensor 18 = Snow Depth (inches)
 */
function fetchCDECData(stationId, startDate, endDate) {
  const startStr = Utilities.formatDate(startDate, 'America/Los_Angeles', 'yyyy-MM-dd');
  const endStr = Utilities.formatDate(endDate, 'America/Los_Angeles', 'yyyy-MM-dd');
  
  // CDEC CSV endpoint
  // Sensor 18 = Snow Depth, Duration D = Daily
  const url = `https://cdec.water.ca.gov/dynamicapp/req/CSVDataServlet?Stations=${stationId}&SensorNums=18&dur_code=D&Start=${startStr}&End=${endStr}`;
  
  try {
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    
    if (response.getResponseCode() !== 200) {
      Logger.log(`CDEC error ${response.getResponseCode()}`);
      return [];
    }
    
    const csvText = response.getContentText();
    const lines = csvText.split('\n');
    
    if (lines.length < 2) return [];
    
    const results = [];
    
    // Skip header row
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // CSV format: STATION_ID,DURATION,SENSOR_NUMBER,SENSOR_TYPE,DATE TIME,OBS DATE,VALUE,DATA_FLAG,UNITS
      const parts = line.split(',');
      if (parts.length < 7) continue;
      
      const dateStr = parts[4] || parts[5];  // DATE TIME or OBS DATE
      const value = parseFloat(parts[6]);
      
      if (!dateStr || isNaN(value)) continue;
      
      // Parse date (format: YYYYMMDD HHmm or similar)
      let date;
      if (dateStr.includes('/')) {
        // Format: MM/DD/YYYY HH:mm
        date = new Date(dateStr);
      } else {
        // Format: YYYYMMDD HHmm
        const year = parseInt(dateStr.substring(0, 4));
        const month = parseInt(dateStr.substring(4, 6)) - 1;
        const day = parseInt(dateStr.substring(6, 8));
        date = new Date(year, month, day);
      }
      
      if (isNaN(date.getTime())) continue;
      
      results.push({
        date: date,
        snowDepth: value
      });
    }
    
    return results;
  } catch (e) {
    Logger.log(`CDEC fetch error: ${e.message}`);
    return [];
  }
}

/**
 * Daily update for CDEC stations
 */
function dailyCDECUpdate() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const stationsSheet = ss.getSheetByName('Stations');
  const dataSheet = ss.getSheetByName('Snow Data');
  
  if (!stationsSheet || !dataSheet) return;
  
  // Get active CDEC stations
  const stationData = stationsSheet.getDataRange().getValues();
  const stations = [];
  for (let i = 1; i < stationData.length; i++) {
    if (stationData[i][3] === 'CDEC' && stationData[i][7] === true) {
      const idMatch = stationData[i][1].match(/CDEC:(\w+)/);
      if (idMatch) {
        stations.push({
          name: stationData[i][0],
          id: idMatch[1],
          state: stationData[i][2]
        });
      }
    }
  }
  
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);  // Last 7 days
  
  let updatedCount = 0;
  
  for (const station of stations) {
    try {
      const data = fetchCDECData(station.id, startDate, endDate);
      
      if (data && data.length > 0) {
        for (const record of data) {
          if (record.snowDepth !== null && record.snowDepth >= 0) {
            const date = record.date;
            const waterYear = date.getMonth() >= 9 ? date.getFullYear() + 1 : date.getFullYear();
            const wyStart = new Date(waterYear - 1, 9, 1);
            const dayOfWY = Math.floor((date - wyStart) / (1000 * 60 * 60 * 24)) + 1;
            const currentWY = getCurrentWaterYear();
            
            const row = [
              Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
              station.name,
              `CDEC:${station.id}`,
              station.state,
              record.snowDepth,
              waterYear,
              dayOfWY,
              Utilities.formatDate(date, Session.getScriptTimeZone(), 'MMM'),
              date.getMonth() + 1,
              waterYear === currentWY,
              new Date().toISOString(),
              'CDEC'
            ];
            
            updateOrAppendRow(dataSheet, row);
            updatedCount++;
          }
        }
      }
    } catch (e) {
      Logger.log(`Error updating ${station.name}: ${e.message}`);
    }
    
    Utilities.sleep(300);
  }
  
  Logger.log(`CDEC daily update: ${updatedCount} records processed`);
}

// ============================================================================
// SNOCOUNTRY INTEGRATION
// ============================================================================

/**
 * Fetches current snow data from SnoCountry for ski resorts
 * Note: Historical data not available - daily capture only
 */
function fetchSnoCountryData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dataSheet = ss.getSheetByName('Snow Data');
  
  if (!dataSheet) {
    SpreadsheetApp.getUi().alert('Run setup first to create Snow Data sheet.');
    return;
  }
  
  const allRows = [];
  const today = new Date();
  const dateStr = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  
  for (const state of SNOCOUNTRY_STATES) {
    Logger.log(`Fetching SnoCountry data for ${state}...`);
    
    try {
      const resorts = fetchSnoCountryState(state);
      
      if (resorts && resorts.length > 0) {
        for (const resort of resorts) {
          // Get base snow depth (most commonly reported)
          const snowDepth = resort.avgBaseDepthMax || resort.avgBaseDepthMin || resort.primarySurfaceCondition ? 
                           parseFloat(resort.avgBaseDepthMax || resort.avgBaseDepthMin || 0) : null;
          
          if (snowDepth !== null && snowDepth > 0) {
            const waterYear = today.getMonth() >= 9 ? today.getFullYear() + 1 : today.getFullYear();
            const wyStart = new Date(waterYear - 1, 9, 1);
            const dayOfWY = Math.floor((today - wyStart) / (1000 * 60 * 60 * 24)) + 1;
            const currentWY = getCurrentWaterYear();
            
            allRows.push([
              dateStr,
              `${resort.resortName} (Resort)`,
              `SNOCOUNTRY:${resort.id}`,
              state,
              snowDepth,
              waterYear,
              dayOfWY,
              Utilities.formatDate(today, Session.getScriptTimeZone(), 'MMM'),
              today.getMonth() + 1,
              waterYear === currentWY,
              new Date().toISOString(),
              'SNOCOUNTRY'
            ]);
          }
        }
        Logger.log(`  Got ${resorts.length} resorts`);
      }
    } catch (e) {
      Logger.log(`  Error: ${e.message}`);
    }
    
    Utilities.sleep(300);
  }
  
  // Write data
  if (allRows.length > 0) {
    for (const row of allRows) {
      updateOrAppendRow(dataSheet, row);
    }
    Logger.log(`Wrote ${allRows.length} SnoCountry records`);
  }
  
  SpreadsheetApp.getUi().alert(`SnoCountry Data Loaded\n${allRows.length} resort records.`);
}

/**
 * Fetches resort data for a single state from SnoCountry API
 */
function fetchSnoCountryState(stateCode) {
  const url = `https://feeds.snocountry.net/getSnowReport.php?apiKey=${SNOCOUNTRY_API_KEY}&states=${stateCode}`;
  
  try {
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    
    if (response.getResponseCode() !== 200) {
      Logger.log(`SnoCountry error ${response.getResponseCode()}`);
      return [];
    }
    
    const data = JSON.parse(response.getContentText());
    
    if (data.items) {
      return data.items;
    }
    
    return [];
  } catch (e) {
    Logger.log(`SnoCountry fetch error: ${e.message}`);
    return [];
  }
}

/**
 * Daily update for SnoCountry - same as fetch since no historical data
 */
function dailySnoCountryUpdate() {
  fetchSnoCountryData();
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Gets the current water year
 */
function getCurrentWaterYear() {
  const now = new Date();
  return now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear();
}

/**
 * Updates existing row or appends new row (upsert by Date + Station)
 */
function updateOrAppendRow(sheet, newRow) {
  const data = sheet.getDataRange().getValues();
  const newDate = newRow[0];
  const newStation = newRow[1];
  
  for (let i = 1; i < data.length; i++) {
    const rowDate = data[i][0];
    const dateStr = rowDate instanceof Date 
      ? Utilities.formatDate(rowDate, Session.getScriptTimeZone(), 'yyyy-MM-dd')
      : rowDate;
    
    if (dateStr === newDate && data[i][1] === newStation) {
      sheet.getRange(i + 1, 1, 1, newRow.length).setValues([newRow]);
      return;
    }
  }
  
  sheet.appendRow(newRow);
}

// ============================================================================
// TRIGGER FOR ADDITIONAL SOURCES
// ============================================================================

/**
 * Creates a trigger for additional sources (runs after main update)
 */
function createAdditionalSourcesTrigger() {
  // Remove existing
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === 'dailyAdditionalSourcesUpdate') {
      ScriptApp.deleteTrigger(trigger);
    }
  }
  
  // Create at 7 AM (1 hour after main trigger)
  ScriptApp.newTrigger('dailyAdditionalSourcesUpdate')
    .timeBased()
    .everyDays(1)
    .atHour(7)
    .create();
  
  SpreadsheetApp.getUi().alert('Additional sources trigger created (7 AM daily).');
}

/**
 * Combined daily update for additional sources
 */
function dailyAdditionalSourcesUpdate() {
  Logger.log('=== ADDITIONAL SOURCES UPDATE ===');
  
  try {
    dailyCDECUpdate();
    Logger.log('✓ CDEC update complete');
  } catch (e) {
    Logger.log('✗ CDEC error: ' + e.message);
  }
  
  Utilities.sleep(2000);
  
  try {
    dailySnoCountryUpdate();
    Logger.log('✓ SnoCountry update complete');
  } catch (e) {
    Logger.log('✗ SnoCountry error: ' + e.message);
  }
  
  Logger.log('=== ADDITIONAL SOURCES UPDATE COMPLETE ===');
}
