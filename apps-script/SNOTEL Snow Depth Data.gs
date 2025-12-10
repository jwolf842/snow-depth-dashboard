/**
 * SNOTEL Snow Depth Data Pipeline for Google Sheets
 * ==================================================
 * Fetches daily snow depth data from NRCS SNOTEL stations and populates
 * a Google Sheet for connection to Tableau Public.
 * 
 * SETUP INSTRUCTIONS:
 * 1. Create a new Google Sheet
 * 2. Go to Extensions > Apps Script
 * 3. Paste this entire script
 * 4. Run setupSheets() once to create the sheet structure
 * 5. Run fetchAllStationsData() to do an initial data load
 * 6. Set up a daily trigger: Run createDailyTrigger() once
 * 
 * The script creates two sheets:
 * - "Snow Data": All historical data (Tableau connects here)
 * - "Stations": Station metadata/configuration
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

// Stations are now managed in the "Stations" sheet
// Add new stations there with columns: Station_Name, Station_ID, State, Source, Elevation_Ft, Active
// Source should be "NRCS" for SNOTEL stations

/**
 * Get active SNOTEL stations from the Stations sheet.
 * Filters for Source = "NRCS" and Active = TRUE
 * @returns {Object} Object with station names as keys and triplets as values
 */
function getActiveStations() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const stationsSheet = ss.getSheetByName(STATIONS_SHEET_NAME);
  
  if (!stationsSheet) {
    Logger.log('Error: Stations sheet not found');
    return {};
  }
  
  const data = stationsSheet.getDataRange().getValues();
  const headers = data[0];
  
  // Find column indices
  const nameCol = headers.indexOf('Station_Name');
  const idCol = headers.indexOf('Station_ID');
  const stateCol = headers.indexOf('State');
  const sourceCol = headers.indexOf('Source');
  const activeCol = headers.indexOf('Active');
  
  // Handle legacy format (Station_ID contains full triplet) vs new format (just ID)
  const stations = {};
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const name = row[nameCol];
    const stationId = row[idCol];
    const state = row[stateCol];
    const source = sourceCol >= 0 ? row[sourceCol] : 'NRCS';
    const active = activeCol >= 0 ? row[activeCol] : true;
    
    // Skip inactive stations or non-NRCS sources
    if (!active || (source && source !== 'NRCS')) continue;
    if (!name || !stationId) continue;
    
    // Build triplet - handle both formats
    let triplet;
    if (String(stationId).includes(':')) {
      // Legacy format: already a triplet like "679:WA:SNTL"
      triplet = stationId;
    } else {
      // New format: just the ID, build triplet
      triplet = `${stationId}:${state}:SNTL`;
    }
    
    stations[name] = triplet;
  }
  
  Logger.log(`Loaded ${Object.keys(stations).length} active NRCS stations`);
  return stations;
}

// How many years of historical data to fetch on initial load
const YEARS_OF_HISTORY = 10;

// Sheet names
const DATA_SHEET_NAME = 'Snow Data';
const STATIONS_SHEET_NAME = 'Stations';


// =============================================================================
// MAIN FUNCTIONS
// =============================================================================

/**
 * Initial setup - creates sheet structure. Run this once.
 */
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Create or get Snow Data sheet
  let dataSheet = ss.getSheetByName(DATA_SHEET_NAME);
  if (!dataSheet) {
    dataSheet = ss.insertSheet(DATA_SHEET_NAME);
  }
  
  // Set up headers for Snow Data (Tableau-friendly format)
  const headers = [
    'Date',           // YYYY-MM-DD
    'Station',        // Station name
    'Station_ID',     // Triplet (679:WA:SNTL)
    'State',          // State code
    'Snow_Depth_In',  // Snow depth in inches
    'Water_Year',     // Water year (Oct-Sep)
    'Day_of_WY',      // Day of water year (1-366)
    'Month',          // Month name
    'Month_Num',      // Month number
    'Is_Current_WY',  // TRUE/FALSE
    'Last_Updated'    // Timestamp of last update
  ];
  
  dataSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  dataSheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#1a73e8')
    .setFontColor('white');
  dataSheet.setFrozenRows(1);
  
  // Create or get Stations sheet
  let stationsSheet = ss.getSheetByName(STATIONS_SHEET_NAME);
  if (!stationsSheet) {
    stationsSheet = ss.insertSheet(STATIONS_SHEET_NAME);
    
    // Set up headers for new Stations sheet (expanded format)
    const stationHeaders = ['Station_Name', 'Station_ID', 'State', 'Source', 'Elevation_Ft', 'HYD_Site', 'HYD_Search', 'Active'];
    stationsSheet.getRange(1, 1, 1, stationHeaders.length).setValues([stationHeaders]);
    stationsSheet.getRange(1, 1, 1, stationHeaders.length)
      .setFontWeight('bold')
      .setBackground('#1a73e8')
      .setFontColor('white');
    
    // Add sample stations
    const sampleStations = [
      ['Paradise', '679', 'WA', 'NRCS', 5420, '', '', true],
      ['Stevens Pass', '791', 'WA', 'NRCS', 4080, '', '', true],
      ['Loveland Basin', '602', 'CO', 'NRCS', 11410, '', '', true],
      ['Brighton', '366', 'UT', 'NRCS', 8740, '', '', true],
    ];
    stationsSheet.getRange(2, 1, sampleStations.length, stationHeaders.length).setValues(sampleStations);
    
    Logger.log('Created new Stations sheet with sample data');
  } else {
    // Check if existing sheet needs column updates
    const existingHeaders = stationsSheet.getRange(1, 1, 1, 8).getValues()[0];
    if (!existingHeaders.includes('Source')) {
      Logger.log('Note: Existing Stations sheet found. Add Source column if needed for filtering.');
    }
  }
  
  stationsSheet.setFrozenRows(1);
  
  Logger.log('✅ Sheets setup complete!');
  SpreadsheetApp.getUi().alert('Setup complete! Sheets created:\n• ' + DATA_SHEET_NAME + '\n• ' + STATIONS_SHEET_NAME + '\n\nAdd stations to the Stations sheet, then run Fetch All Data.');
}


/**
 * Fetch data for all configured stations. 
 * Use for initial load or full refresh.
 */
function fetchAllStationsData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dataSheet = ss.getSheetByName(DATA_SHEET_NAME);
  
  if (!dataSheet) {
    SpreadsheetApp.getUi().alert('Error: Run setupSheets() first!');
    return;
  }
  
  // Get stations dynamically from sheet
  const SNOTEL_STATIONS = getActiveStations();
  
  if (Object.keys(SNOTEL_STATIONS).length === 0) {
    SpreadsheetApp.getUi().alert('Error: No active NRCS stations found in Stations sheet!');
    return;
  }
  
  // Clear existing data (keep headers)
  const lastRow = dataSheet.getLastRow();
  if (lastRow > 1) {
    dataSheet.getRange(2, 1, lastRow - 1, 11).clearContent();
  }
  
  const allData = [];
  const stationNames = Object.keys(SNOTEL_STATIONS);
  
  for (let i = 0; i < stationNames.length; i++) {
    const stationName = stationNames[i];
    const triplet = SNOTEL_STATIONS[stationName];
    
    Logger.log(`Fetching ${stationName} (${i + 1}/${stationNames.length})...`);
    
    try {
      const stationData = fetchStationData(stationName, triplet, YEARS_OF_HISTORY);
      if (stationData && stationData.length > 0) {
        allData.push(...stationData);
        Logger.log(`  ✓ Got ${stationData.length} records`);
      }
    } catch (e) {
      Logger.log(`  ✗ Error: ${e.message}`);
    }
    
    // Small delay to avoid rate limiting
    Utilities.sleep(500);
  }
  
  // Write all data to sheet
  if (allData.length > 0) {
    dataSheet.getRange(2, 1, allData.length, allData[0].length).setValues(allData);
    Logger.log(`✅ Wrote ${allData.length} total records to sheet`);
  }
  
  // Auto-resize columns
  for (let i = 1; i <= 11; i++) {
    dataSheet.autoResizeColumn(i);
  }
  
  SpreadsheetApp.getUi().alert(`Data load complete!\n${allData.length} records loaded for ${stationNames.length} stations.`);
}


/**
 * Daily update - fetches only current water year data.
 * This is called by the time-driven trigger.
 */
function dailyUpdate() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dataSheet = ss.getSheetByName(DATA_SHEET_NAME);
  
  if (!dataSheet) {
    Logger.log('Error: Data sheet not found');
    return;
  }
  
  // Get stations dynamically from sheet
  const SNOTEL_STATIONS = getActiveStations();
  const stationNames = Object.keys(SNOTEL_STATIONS);
  
  if (stationNames.length === 0) {
    Logger.log('Error: No active NRCS stations found');
    return;
  }
  
  let updatedCount = 0;
  
  for (const stationName of stationNames) {
    const triplet = SNOTEL_STATIONS[stationName];
    
    try {
      // Fetch just last 7 days to get recent updates
      const recentData = fetchStationData(stationName, triplet, 0, 7);
      
      if (recentData && recentData.length > 0) {
        // Update or append each record
        for (const row of recentData) {
          updateOrAppendRow(dataSheet, row);
        }
        updatedCount += recentData.length;
      }
    } catch (e) {
      Logger.log(`Error updating ${stationName}: ${e.message}`);
    }
    
    Utilities.sleep(300);
  }
  
  Logger.log(`✅ Daily update complete. Processed ${updatedCount} records.`);
}


// =============================================================================
// DATA FETCHING FUNCTIONS
// =============================================================================

/**
 * Fetch data for a single station from NRCS API.
 * 
 * @param {string} stationName - Display name of the station
 * @param {string} triplet - Station ID (e.g., '679:WA:SNTL')
 * @param {number} yearsBack - Years of history (0 for current WY only)
 * @param {number} daysBack - Days back (overrides yearsBack if > 0)
 * @returns {Array} Array of row arrays for the sheet
 */
function fetchStationData(stationName, triplet, yearsBack = 1, daysBack = 0) {
  const [stationId, state, network] = triplet.split(':');
  
  // Calculate date range
  const today = new Date();
  let startDate;
  
  if (daysBack > 0) {
    // Fetch last N days
    startDate = new Date(today);
    startDate.setDate(startDate.getDate() - daysBack);
  } else {
    // Fetch by water years
    const currentWY = today.getMonth() >= 9 ? today.getFullYear() + 1 : today.getFullYear();
    const startWY = currentWY - yearsBack;
    startDate = new Date(startWY - 1, 9, 1); // Oct 1 of start year
  }
  
  const startStr = Utilities.formatDate(startDate, 'America/Los_Angeles', 'yyyy-MM-dd');
  const endStr = Utilities.formatDate(today, 'America/Los_Angeles', 'yyyy-MM-dd');
  
  // Build NRCS Report Generator URL
  const encodedTriplet = triplet.replace(/:/g, '%3A');
  const url = `https://wcc.sc.egov.usda.gov/reportGenerator/view_csv/customSingleStationReport/daily/${encodedTriplet}%7Cid=%22%22%7Cname/${startStr},${endStr}/SNWD::value`;
  
  // Fetch data
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  
  if (response.getResponseCode() !== 200) {
    throw new Error(`HTTP ${response.getResponseCode()}`);
  }
  
  const csvText = response.getContentText();
  
  // Parse CSV (skip comment lines starting with #)
  const lines = csvText.split('\n').filter(line => line && !line.startsWith('#'));
  
  if (lines.length < 2) {
    return [];
  }
  
  // Process data rows (skip header)
  const rows = [];
  const now = new Date();
  const currentWY = now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear();
  
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length < 2) continue;
    
    const dateStr = parts[0].trim();
    const snowDepth = parts[1].trim();
    
    // Skip empty values
    if (!snowDepth || snowDepth === '') continue;
    
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) continue;
    
    // Calculate water year (Oct 1 starts new WY)
    const waterYear = date.getMonth() >= 9 ? date.getFullYear() + 1 : date.getFullYear();
    
    // Calculate day of water year (Oct 1 = Day 1)
    const wyStart = new Date(waterYear - 1, 9, 1);
    const dayOfWY = Math.floor((date - wyStart) / (1000 * 60 * 60 * 24)) + 1;
    
    // Month info
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
    const monthNum = date.getMonth() + 1;
    const monthName = monthNames[date.getMonth()];
    
    // Is current water year?
    const isCurrentWY = (waterYear === currentWY);
    
    rows.push([
      Utilities.formatDate(date, 'America/Los_Angeles', 'yyyy-MM-dd'),
      stationName,
      triplet,
      state,
      parseFloat(snowDepth),
      waterYear,
      dayOfWY,
      monthName,
      monthNum,
      isCurrentWY,
      Utilities.formatDate(now, 'America/Los_Angeles', 'yyyy-MM-dd HH:mm:ss')
    ]);
  }
  
  return rows;
}


/**
 * Update existing row or append new row.
 * Matches on Date + Station combination.
 */
function updateOrAppendRow(sheet, newRow) {
  const data = sheet.getDataRange().getValues();
  const dateCol = 0;  // Column A
  const stationCol = 1;  // Column B
  
  const newDate = newRow[0];
  const newStation = newRow[1];
  
  // Look for existing row
  for (let i = 1; i < data.length; i++) {
    const rowDate = data[i][dateCol];
    const rowStation = data[i][stationCol];
    
    // Format date for comparison
    let rowDateStr = rowDate;
    if (rowDate instanceof Date) {
      rowDateStr = Utilities.formatDate(rowDate, 'America/Los_Angeles', 'yyyy-MM-dd');
    }
    
    if (rowDateStr === newDate && rowStation === newStation) {
      // Update existing row
      sheet.getRange(i + 1, 1, 1, newRow.length).setValues([newRow]);
      return;
    }
  }
  
  // Append new row if not found
  sheet.appendRow(newRow);
}


// =============================================================================
// TRIGGER MANAGEMENT
// =============================================================================

/**
 * Create a daily trigger to run at 6 AM.
 * Run this once to set up automatic updates.
 */
function createDailyTrigger() {
  // Remove existing triggers first
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === 'dailyUpdate') {
      ScriptApp.deleteTrigger(trigger);
    }
  }
  
  // Create new daily trigger at 6 AM
  ScriptApp.newTrigger('dailyUpdate')
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .create();
  
  Logger.log('✅ Daily trigger created (runs at 6 AM)');
  SpreadsheetApp.getUi().alert('Daily trigger created!\nThe script will run automatically at 6 AM every day.');
}


/**
 * Remove all triggers for this project.
 */
function removeAllTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    ScriptApp.deleteTrigger(trigger);
  }
  Logger.log('All triggers removed');
  SpreadsheetApp.getUi().alert('All triggers removed.');
}


// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Add custom menu to the spreadsheet.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🏔️ SNOTEL Data')
    .addItem('📋 Setup Sheets', 'setupSheets')
    .addItem('⬇️ Fetch All Data (Full Refresh)', 'fetchAllStationsData')
    .addItem('🔄 Daily Update (Recent Data)', 'dailyUpdate')
    .addSeparator()
    .addItem('📊 List Active Stations', 'listActiveStations')
    .addItem('📥 Import Stations from CSV', 'importStationsFromCSV')
    .addSeparator()
    .addItem('⏰ Create Daily Trigger', 'createDailyTrigger')
    .addItem('🗑️ Remove All Triggers', 'removeAllTriggers')
    .addToUi();
}


/**
 * Test function - fetch a single station.
 */
function testSingleStation() {
  const data = fetchStationData('Paradise', '679:WA:SNTL', 1);
  Logger.log(`Fetched ${data.length} records`);
  Logger.log('Sample row: ' + JSON.stringify(data[0]));
}


/**
 * Utility: List all active stations in the log.
 */
function listActiveStations() {
  const stations = getActiveStations();
  const count = Object.keys(stations).length;
  
  Logger.log(`=== ${count} Active NRCS Stations ===`);
  for (const [name, triplet] of Object.entries(stations)) {
    Logger.log(`  ${name}: ${triplet}`);
  }
  
  SpreadsheetApp.getUi().alert(`Found ${count} active NRCS stations.\nCheck View > Logs for details.`);
}


/**
 * Utility: Import stations from CSV data.
 * Paste CSV content into a temporary sheet named "Import" first.
 */
function importStationsFromCSV() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const importSheet = ss.getSheetByName('Import');
  const stationsSheet = ss.getSheetByName(STATIONS_SHEET_NAME);
  
  if (!importSheet) {
    SpreadsheetApp.getUi().alert('Create a sheet named "Import" and paste CSV data there first.');
    return;
  }
  
  if (!stationsSheet) {
    SpreadsheetApp.getUi().alert('Run setupSheets() first to create the Stations sheet.');
    return;
  }
  
  const importData = importSheet.getDataRange().getValues();
  const importHeaders = importData[0];
  
  // Find columns in import data
  const cols = {
    name: importHeaders.indexOf('Station_Name'),
    id: importHeaders.indexOf('Station_ID'),
    state: importHeaders.indexOf('State'),
    source: importHeaders.indexOf('Source'),
    elev: importHeaders.indexOf('Elevation_Ft'),
    hyd_site: importHeaders.indexOf('HYD_Site'),
    hyd_search: importHeaders.indexOf('HYD_Search'),
    active: importHeaders.indexOf('Active')
  };
  
  // Append to stations sheet
  const lastRow = stationsSheet.getLastRow();
  let addedCount = 0;
  
  for (let i = 1; i < importData.length; i++) {
    const row = importData[i];
    if (!row[cols.name]) continue;
    
    const newRow = [
      row[cols.name] || '',
      row[cols.id] || '',
      row[cols.state] || '',
      row[cols.source] || 'NRCS',
      row[cols.elev] || '',
      row[cols.hyd_site] || '',
      row[cols.hyd_search] || '',
      row[cols.active] !== false && row[cols.active] !== 'FALSE'
    ];
    
    stationsSheet.appendRow(newRow);
    addedCount++;
  }
  
  SpreadsheetApp.getUi().alert(`Imported ${addedCount} stations.\nYou can now delete the Import sheet.`);
}