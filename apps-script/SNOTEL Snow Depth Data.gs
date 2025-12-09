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
// CONFIGURATION - Add or remove stations here
// =============================================================================

const SNOTEL_STATIONS = {
  // Format: 'Station Name': 'station_id:state:SNTL'
  // Find IDs at: https://wcc.sc.egov.usda.gov/nwcc/yearcount?network=sntl&counttype=statelist&state=
  
  // Washington
  'Paradise': '679:WA:SNTL',
  'Stevens Pass': '791:WA:SNTL',
  'Snoqualmie Pass': '778:WA:SNTL',
  
  // Colorado
  'Loveland Basin': '602:CO:SNTL',
  'Berthoud Summit': '335:CO:SNTL',
  
  // California
  'Mammoth Pass': '587:CA:SNTL',
  'Donner Summit': '428:CA:SNTL',
  
  // Utah
  'Brighton': '366:UT:SNTL',
  'Snowbird': '766:UT:SNTL',
  'Alta': '313:UT:SNTL',
  
  // Wyoming
  'Jackson Hole': '538:WY:SNTL',
  'Grand Targhee': '488:WY:SNTL',
};

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
  }
  
  // Populate stations list
  const stationHeaders = ['Station_Name', 'Station_ID', 'State', 'Active'];
  stationsSheet.getRange(1, 1, 1, stationHeaders.length).setValues([stationHeaders]);
  stationsSheet.getRange(1, 1, 1, stationHeaders.length)
    .setFontWeight('bold')
    .setBackground('#1a73e8')
    .setFontColor('white');
  
  const stationRows = Object.entries(SNOTEL_STATIONS).map(([name, triplet]) => {
    const [id, state, network] = triplet.split(':');
    return [name, triplet, state, true];
  });
  
  if (stationRows.length > 0) {
    stationsSheet.getRange(2, 1, stationRows.length, stationHeaders.length).setValues(stationRows);
  }
  
  stationsSheet.setFrozenRows(1);
  
  Logger.log('✅ Sheets setup complete!');
  SpreadsheetApp.getUi().alert('Setup complete! Sheets created:\n• ' + DATA_SHEET_NAME + '\n• ' + STATIONS_SHEET_NAME);
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
  
  const stationNames = Object.keys(SNOTEL_STATIONS);
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
