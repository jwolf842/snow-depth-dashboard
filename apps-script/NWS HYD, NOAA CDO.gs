/**
 * NWS HYD & NOAA CDO Integration for SNOTEL Dashboard
 * 
 * This script adds NWS Hydrometeorological stations to your existing SNOTEL pipeline.
 * 
 * SETUP REQUIRED:
 * 1. Get a free NOAA CDO API token at: https://www.ncdc.noaa.gov/cdo-web/token
 * 2. Replace 'YOUR_NOAA_CDO_TOKEN_HERE' below with your token
 * 3. Run setupNWSStations() once to create the stations sheet
 * 4. Run fetchNWSHistoricalData() to load historical data (takes time due to API limits)
 * 5. Run dailyNWSUpdate() daily via trigger for current readings
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

//const NOAA_CDO_TOKEN = 'YOUR_NOAA_CDO_TOKEN_HERE';  // Get from https://www.ncdc.noaa.gov/cdo-web/token
function getNoaaCdoToken() {
  return PropertiesService.getScriptProperties().getProperty('NOAA_CDO_TOKEN');
}
const NOAA_API_BASE = 'https://www.ncei.noaa.gov/cdo-web/api/v2';

/**
 * NWS HYD Stations Configuration
 * Each entry maps a display name to its GHCND station ID and NWS HYD source
 * 
 * To find more stations:
 * - GHCND IDs: https://www.ncdc.noaa.gov/cdo-web/datatools/findstation
 * - NWS HYD products: https://forecast.weather.gov/product_types.php?site=XXX
 */
const NWS_STATIONS = {
  // Vermont Stations (BTV office)
  'Mount Mansfield': {
    ghcnd_id: 'GHCND:USC00435416',
    state: 'VT',
    elevation_ft: 3950,
    hyd_site: 'BTV',
    hyd_search: 'Mt Mansfield'
  },
  'Lake Placid': {
    ghcnd_id: 'GHCND:USC00304555',
    state: 'NY',
    elevation_ft: 1900,
    hyd_site: 'BTV',
    hyd_search: 'Lake Placid 2 S'
  },
  'Wilmington NY': {
    ghcnd_id: 'GHCND:USC00309670',
    state: 'NY',
    elevation_ft: 1950,
    hyd_site: 'BTV',
    hyd_search: 'Wilmington 2 W'
  },
  'Saranac Lake': {
    ghcnd_id: 'GHCND:USW00094740',
    state: 'NY',
    elevation_ft: 1585,
    hyd_site: 'BTV',
    hyd_search: 'Saranac Lake Arpt'
  },
  
  // New Hampshire Stations (GYX office - Gray, ME)
  'Mount Washington': {
    ghcnd_id: 'GHCND:USC00275712',
    state: 'NH',
    elevation_ft: 6262,
    hyd_site: 'GYX',
    hyd_search: 'Mt Washington'
  },
  'Pinkham Notch': {
    ghcnd_id: 'GHCND:USC00276818',
    state: 'NH',
    elevation_ft: 2025,
    hyd_site: 'GYX',
    hyd_search: 'Pinkham Notch'
  },
  
  // Maine Stations (GYX office)
  'Rangeley': {
    ghcnd_id: 'GHCND:USC00176937',
    state: 'ME',
    elevation_ft: 1545,
    hyd_site: 'GYX',
    hyd_search: 'Rangeley'
  },
  
  // Colorado Stations (BOU office - Denver)
  'Berthoud Pass': {
    ghcnd_id: 'GHCND:USC00050704',
    state: 'CO',
    elevation_ft: 11315,
    hyd_site: 'BOU',
    hyd_search: 'Berthoud Pass'
  },
  
  // California Stations (REV office - Reno)
  'Donner Memorial SP': {
    ghcnd_id: 'GHCND:USC00042467',
    state: 'CA',
    elevation_ft: 5935,
    hyd_site: 'REV',
    hyd_search: 'Donner'
  },
  
  // Utah Stations (SLC office)
  'Alta': {
    ghcnd_id: 'GHCND:USC00420072',
    state: 'UT',
    elevation_ft: 8730,
    hyd_site: 'SLC',
    hyd_search: 'Alta'
  },
  'Brighton': {
    ghcnd_id: 'GHCND:USC00420910',
    state: 'UT',
    elevation_ft: 8730,
    hyd_site: 'SLC',
    hyd_search: 'Brighton'
  }
};

// ============================================================================
// MENU SETUP
// ============================================================================

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🌨️ NWS Data')
    .addItem('Setup NWS Stations Sheet', 'setupNWSStations')
    .addSeparator()
    .addItem('Fetch Historical Data (NOAA CDO)', 'fetchNWSHistoricalData')
    .addItem('Daily Update (NWS HYD)', 'dailyNWSUpdate')
    .addSeparator()
    .addItem('Create Daily Trigger', 'createNWSDailyTrigger')
    .addItem('Remove All Triggers', 'removeNWSTriggers')
    .addToUi();
}

// ============================================================================
// SHEET SETUP
// ============================================================================

/**
 * Adds NWS stations to the unified Stations sheet
 */
function setupNWSStations() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  let stationsSheet = ss.getSheetByName('Stations');
  if (!stationsSheet) {
    SpreadsheetApp.getUi().alert('Run SNOTEL setupSheets() first to create the Stations sheet.');
    return;
  }
  
  // Get existing station names to avoid duplicates
  const existingData = stationsSheet.getDataRange().getValues();
  const existingNames = new Set(existingData.slice(1).map(row => row[0]));
  
  // Build rows for NWS stations
  const newRows = [];
  for (const [name, config] of Object.entries(NWS_STATIONS)) {
    if (!existingNames.has(name)) {
      newRows.push([
        name,
        config.ghcnd_id,
        config.state,
        'NWS',
        config.elevation_ft,
        config.hyd_site,
        config.hyd_search,
        true
      ]);
    }
  }
  
  // Append new stations
  if (newRows.length > 0) {
    const lastRow = stationsSheet.getLastRow();
    stationsSheet.getRange(lastRow + 1, 1, newRows.length, 8).setValues(newRows);
    
    // Add checkboxes to Active column for new rows
    //stationsSheet.getRange(lastRow + 1, 8, newRows.length, 1).insertCheckboxes();
  }
  
  Logger.log(`Added ${newRows.length} NWS stations to unified Stations sheet`);
  SpreadsheetApp.getUi().alert(`Added ${newRows.length} NWS stations to Stations sheet.`);
}

// ============================================================================
// NOAA CDO API - HISTORICAL DATA
// ============================================================================

/**
 * Fetches historical snow depth data from NOAA CDO API
 * Note: API limits to 1 year per request and 5 requests/second
 */
function fetchNWSHistoricalData() {
  if (!getNoaaCdoToken()) {
    SpreadsheetApp.getUi().alert('Token Required', 'Please add your NOAA CDO API token to the script.\n\nGet a free token at:\nhttps://www.ncdc.noaa.gov/cdo-web/token', SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const stationsSheet = ss.getSheetByName('Stations');
  
  if (!stationsSheet) {
    SpreadsheetApp.getUi().alert('Run Setup First', 'Please run SNOTEL setupSheets() first.', SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  
  // Get or create Snow Data sheet
  let dataSheet = ss.getSheetByName('Snow Data');
  if (!dataSheet) {
    dataSheet = ss.insertSheet('Snow Data');
    const headers = ['Date', 'Station', 'Station_ID', 'State', 'Snow_Depth_In', 'Water_Year', 'Day_of_WY', 'Month', 'Month_Num', 'Is_Current_WY', 'Last_Updated', 'Source'];
    dataSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    dataSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#34a853').setFontColor('white');
  }
  
  // Get active stations
  const stationData = stationsSheet.getDataRange().getValues();
  const stations = [];
  for (let i = 1; i < stationData.length; i++) {
    if (stationData[i][3] === 'NWS' && stationData[i][7] === true) {  // Source=NWS and Active
      stations.push({
        name: stationData[i][0],
        ghcnd_id: stationData[i][1],
        state: stationData[i][2]
      });
    }
  }
  
  Logger.log(`Fetching historical data for ${stations.length} active stations`);
  
  // Calculate date range (10 years back)
  const endDate = new Date();
  const startYear = endDate.getFullYear() - 10;
  
  let totalRecords = 0;
  const allRows = [];
  
  for (const station of stations) {
    Logger.log(`Processing ${station.name} (${station.ghcnd_id})...`);
    
    // NOAA API limits to 1 year per request, so we loop by year
    for (let year = startYear; year <= endDate.getFullYear(); year++) {
      const yearStart = `${year}-01-01`;
      const yearEnd = `${year}-12-31`;
      
      try {
        const data = fetchNOAAData(station.ghcnd_id, 'SNWD', yearStart, yearEnd);
        
        if (data && data.results) {
          for (const record of data.results) {
            const date = new Date(record.date);
            const snowDepthMM = record.value;
            const snowDepthIn = snowDepthMM / 25.4;  // Convert mm to inches
            
            // Calculate water year fields
            const waterYear = date.getMonth() >= 9 ? date.getFullYear() + 1 : date.getFullYear();
            const wyStart = new Date(waterYear - 1, 9, 1);  // Oct 1
            const dayOfWY = Math.floor((date - wyStart) / (1000 * 60 * 60 * 24)) + 1;
            const currentWY = getCurrentWaterYear();
            
            allRows.push([
              Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
              station.name,
              station.ghcnd_id,
              station.state,
              Math.round(snowDepthIn * 10) / 10,
              waterYear,
              dayOfWY,
              Utilities.formatDate(date, Session.getScriptTimeZone(), 'MMM'),
              date.getMonth() + 1,
              waterYear === currentWY,
              new Date().toISOString(),
              'NOAA_CDO'
            ]);
          }
          totalRecords += data.results.length;
          Logger.log(`  ${year}: ${data.results.length} records`);
        }
        
        // Rate limiting: 5 requests/second max
        Utilities.sleep(250);
        
      } catch (e) {
        Logger.log(`  ${year}: Error - ${e.message}`);
      }
    }
  }
  
  // Write all data
  if (allRows.length > 0) {
    // Find next empty row
    const lastRow = dataSheet.getLastRow();
    //dataSheet.getRange(lastRow + 1, 1, allRows.length, allRows[0].length).setValues(allRows);
    writeRowsToBigQuery(allRows);
    Logger.log(`Wrote ${allRows.length} records to sheet`);
  }
  
  SpreadsheetApp.getUi().alert('Historical Data Loaded', `Fetched ${totalRecords} snow depth records from NOAA CDO API.`, SpreadsheetApp.getUi().ButtonSet.OK);
}

/**
 * Makes a request to the NOAA CDO API
 */
function fetchNOAAData(stationId, dataType, startDate, endDate) {
  const url = `${NOAA_API_BASE}/data?datasetid=GHCND&stationid=${stationId}&datatypeid=${dataType}&startdate=${startDate}&enddate=${endDate}&units=metric&limit=1000`;
  
  const options = {
    method: 'get',
    headers: {
      'token': getNoaaCdoToken()
    },
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(url, options);
  const code = response.getResponseCode();
  
  if (code === 200) {
    return JSON.parse(response.getContentText());
  } else if (code === 429) {
    // Rate limited - wait and retry
    Utilities.sleep(1000);
    return fetchNOAAData(stationId, dataType, startDate, endDate);
  } else {
    Logger.log(`NOAA API error ${code}: ${response.getContentText()}`);
    return null;
  }
}

// ============================================================================
// NWS HYD PARSING - DAILY UPDATES
// ============================================================================

/**
 * Fetches current day's snow depth from NWS HYD products
 * This parses the daily hydrometeorological report text
 */
function dailyNWSUpdate() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const stationsSheet = ss.getSheetByName('Stations');
  
  if (!stationsSheet) {
    Logger.log('NWS Stations sheet not found. Run setup first.');
    return;
  }
  
  let dataSheet = ss.getSheetByName('Snow Data');
  if (!dataSheet) {
    Logger.log('Snow Data sheet not found.');
    return;
  }
  
  // Get active stations grouped by HYD site
  const stationData = stationsSheet.getDataRange().getValues();
  const stationsBySite = {};
  
  for (let i = 1; i < stationData.length; i++) {
    if (stationData[i][3] === 'NWS' && stationData[i][7] === true) {  // Source=NWS and Active
      const site = stationData[i][5];  // HYD_Site
      if (!site) continue;  // Skip if no HYD_Site
      if (!stationsBySite[site]) {
        stationsBySite[site] = [];
      }
      stationsBySite[site].push({
        name: stationData[i][0],
        ghcnd_id: stationData[i][1],
        state: stationData[i][2],
        search: stationData[i][6]  // HYD_Search
      });
    }
  }
  
  const newRows = [];
  const today = new Date();
  const dateStr = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  
  // Fetch and parse HYD product for each NWS office
  for (const [site, stations] of Object.entries(stationsBySite)) {
    Logger.log(`Fetching HYD product from ${site}...`);
    
    try {
      const hydData = fetchNWSHydProduct(site);
      
      if (hydData) {
        for (const station of stations) {
          const snowDepth = parseSnowDepthFromHYD(hydData, station.search);
          
          if (snowDepth !== null) {
            const waterYear = today.getMonth() >= 9 ? today.getFullYear() + 1 : today.getFullYear();
            const wyStart = new Date(waterYear - 1, 9, 1);
            const dayOfWY = Math.floor((today - wyStart) / (1000 * 60 * 60 * 24)) + 1;
            const currentWY = getCurrentWaterYear();
            
            newRows.push([
              dateStr,
              station.name,
              station.ghcnd_id,
              station.state,
              snowDepth,
              waterYear,
              dayOfWY,
              Utilities.formatDate(today, Session.getScriptTimeZone(), 'MMM'),
              today.getMonth() + 1,
              waterYear === currentWY,
              new Date().toISOString(),
              'NWS_HYD'
            ]);
            
            Logger.log(`  ${station.name}: ${snowDepth} inches`);
          } else {
            Logger.log(`  ${station.name}: No data found`);
          }
        }
      }
    } catch (e) {
      Logger.log(`Error fetching ${site} HYD: ${e.message}`);
    }
  }
  
  // Update or append rows
  if (newRows.length > 0) {
    for (const row of newRows) {
      //updateOrAppendNWSRow(dataSheet, row);
      writeRowsToBigQuery([row]);
    }
    Logger.log(`Updated ${newRows.length} NWS HYD records`);
  }
}

/**
 * Fetches the NWS HYD product text for a given site
 */
function fetchNWSHydProduct(site) {
  const url = `https://forecast.weather.gov/product.php?site=${site}&issuedby=${site}&product=HYD&format=txt&version=1`;
  
  try {
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (response.getResponseCode() === 200) {
      return response.getContentText();
    }
  } catch (e) {
    Logger.log(`Error fetching HYD from ${site}: ${e.message}`);
  }
  return null;
}

/**
 * Parses snow depth (Total column) from HYD text for a specific station
 */
function parseSnowDepthFromHYD(hydText, searchTerm) {
  const lines = hydText.split('\n');
  
  for (const line of lines) {
    // Check if this line contains our station search term
    if (line.toLowerCase().includes(searchTerm.toLowerCase())) {
      // HYD format is fixed-width. Snow Total is typically in columns 65-70
      // Format: Station              Precip  Temperature   Present             Snow
      //                              24 Hrs  Max Min Cur   Weather         New Total SWE
      
      // Try to extract the snow total - it's usually the last or second-to-last number
      const parts = line.trim().split(/\s+/);
      
      // Look for numeric values that could be snow depth (usually 0-200 range)
      for (let i = parts.length - 1; i >= 0; i--) {
        const val = parseFloat(parts[i]);
        if (!isNaN(val) && val >= 0 && val <= 500) {
          // Check if this is likely the snow total (not temp, which could be negative)
          // Snow totals are typically integers
          if (Number.isInteger(val) || parts[i].includes('.')) {
            return val;
          }
        }
      }
      
      // Alternative: try regex for the last number in the line
      const matches = line.match(/(\d+)\s*$/);
      if (matches) {
        return parseInt(matches[1]);
      }
    }
  }
  
  return null;
}

/**
 * Updates existing row or appends new row (upsert pattern)
 */
function updateOrAppendNWSRow(sheet, rowData) {
  const data = sheet.getDataRange().getValues();
  const dateToFind = rowData[0];  // Date
  const stationToFind = rowData[1];  // Station name
  
  // Search for existing row with same date and station
  for (let i = 1; i < data.length; i++) {
    const existingDate = data[i][0];
    const dateStr = existingDate instanceof Date 
      ? Utilities.formatDate(existingDate, Session.getScriptTimeZone(), 'yyyy-MM-dd')
      : existingDate;
    
    if (dateStr === dateToFind && data[i][1] === stationToFind) {
      // Update existing row
      sheet.getRange(i + 1, 1, 1, rowData.length).setValues([rowData]);
      return;
    }
  }
  
  // Append new row
  sheet.appendRow(rowData);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Gets the current water year (Oct 1 - Sep 30)
 */
function getCurrentWaterYear() {
  const now = new Date();
  return now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear();
}

/**
 * Creates a daily trigger to run NWS HYD updates
 */
function createNWSDailyTrigger() {
  // Remove existing triggers first
  removeNWSTriggers();
  
  // Create new trigger at 8 AM
  ScriptApp.newTrigger('dailyNWSUpdate')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .create();
  
  Logger.log('Daily NWS trigger created for 8 AM');
  SpreadsheetApp.getUi().alert('Trigger Created', 'Daily NWS HYD update will run at 8 AM.', SpreadsheetApp.getUi().ButtonSet.OK);
}

/**
 * Removes all NWS-related triggers
 */
function removeNWSTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === 'dailyNWSUpdate') {
      ScriptApp.deleteTrigger(trigger);
    }
  }
  Logger.log('NWS triggers removed');
}

// ============================================================================
// STATION DISCOVERY HELPERS
// ============================================================================

/**
 * Searches NOAA CDO for stations with snow depth data in a state
 * Useful for finding new stations to add
 */
function findSnowStationsInState(stateCode) {
  if (!getNoaaCdoToken()) {
    Logger.log('Please add your NOAA CDO API token first');
    return;
  }
  
  const url = `${NOAA_API_BASE}/stations?datasetid=GHCND&datatypeid=SNWD&locationid=FIPS:${getStateFIPS(stateCode)}&limit=100`;
  
  const options = {
    method: 'get',
    headers: { 'token': getNoaaCdoToken() },
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(url, options);
  
  if (response.getResponseCode() === 200) {
    const data = JSON.parse(response.getContentText());
    
    if (data.results) {
      Logger.log(`Found ${data.results.length} stations with snow depth data in ${stateCode}:`);
      for (const station of data.results) {
        Logger.log(`  ${station.id}: ${station.name} (${station.mindate} to ${station.maxdate})`);
      }
    }
  }
}

/**
 * Returns FIPS code for a state abbreviation
 */
function getStateFIPS(stateCode) {
  const fips = {
    'AL': '01', 'AK': '02', 'AZ': '04', 'AR': '05', 'CA': '06',
    'CO': '08', 'CT': '09', 'DE': '10', 'FL': '12', 'GA': '13',
    'HI': '15', 'ID': '16', 'IL': '17', 'IN': '18', 'IA': '19',
    'KS': '20', 'KY': '21', 'LA': '22', 'ME': '23', 'MD': '24',
    'MA': '25', 'MI': '26', 'MN': '27', 'MS': '28', 'MO': '29',
    'MT': '30', 'NE': '31', 'NV': '32', 'NH': '33', 'NJ': '34',
    'NM': '35', 'NY': '36', 'NC': '37', 'ND': '38', 'OH': '39',
    'OK': '40', 'OR': '41', 'PA': '42', 'RI': '44', 'SC': '45',
    'SD': '46', 'TN': '47', 'TX': '48', 'UT': '49', 'VT': '50',
    'VA': '51', 'WA': '53', 'WV': '54', 'WI': '55', 'WY': '56'
  };
  return fips[stateCode.toUpperCase()] || '00';
}

/**
 * Lists all available NWS HYD product sites
 * Run this to discover which NWS offices publish HYD products
 */
function listNWSHydSites() {
  // Common NWS offices that publish HYD products with snow data
  const knownSites = [
    { code: 'BTV', name: 'Burlington, VT', region: 'Northeast' },
    { code: 'GYX', name: 'Gray, ME', region: 'Northeast' },
    { code: 'ALY', name: 'Albany, NY', region: 'Northeast' },
    { code: 'BGM', name: 'Binghamton, NY', region: 'Northeast' },
    { code: 'BUF', name: 'Buffalo, NY', region: 'Northeast' },
    { code: 'CLE', name: 'Cleveland, OH', region: 'Great Lakes' },
    { code: 'DTX', name: 'Detroit, MI', region: 'Great Lakes' },
    { code: 'GRB', name: 'Green Bay, WI', region: 'Great Lakes' },
    { code: 'MQT', name: 'Marquette, MI', region: 'Great Lakes' },
    { code: 'DLH', name: 'Duluth, MN', region: 'Upper Midwest' },
    { code: 'MPX', name: 'Minneapolis, MN', region: 'Upper Midwest' },
    { code: 'BOU', name: 'Denver/Boulder, CO', region: 'Rockies' },
    { code: 'GJT', name: 'Grand Junction, CO', region: 'Rockies' },
    { code: 'SLC', name: 'Salt Lake City, UT', region: 'Rockies' },
    { code: 'RIW', name: 'Riverton, WY', region: 'Rockies' },
    { code: 'MSO', name: 'Missoula, MT', region: 'Northern Rockies' },
    { code: 'TFX', name: 'Great Falls, MT', region: 'Northern Rockies' },
    { code: 'BOI', name: 'Boise, ID', region: 'Pacific Northwest' },
    { code: 'PDT', name: 'Pendleton, OR', region: 'Pacific Northwest' },
    { code: 'SEW', name: 'Seattle, WA', region: 'Pacific Northwest' },
    { code: 'OTX', name: 'Spokane, WA', region: 'Pacific Northwest' },
    { code: 'REV', name: 'Reno, NV', region: 'Sierra Nevada' },
    { code: 'STO', name: 'Sacramento, CA', region: 'Sierra Nevada' }
  ];
  
  Logger.log('Known NWS offices with HYD products:');
  Logger.log('=====================================');
  
  for (const site of knownSites) {
    Logger.log(`${site.code}: ${site.name} (${site.region})`);
  }
  
  Logger.log('\nTo add stations from a site, check the HYD product at:');
  Logger.log('https://forecast.weather.gov/product.php?site=XXX&issuedby=XXX&product=HYD&format=CI&version=1');
  Logger.log('(Replace XXX with the site code)');
}