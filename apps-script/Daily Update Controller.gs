/**
 * Daily Update Controller
 * =======================
 * Runs both SNOTEL and NWS HYD daily updates from a single trigger.
 * 
 * SETUP:
 * 1. Add this file to your Apps Script project alongside:
 *    - SNOTEL Snow Depth Data.gs
 *    - NWS HYD, NOAA CDO.gs
 * 2. Run createMasterDailyTrigger() once to set up the daily trigger
 */

/**
 * Master daily update function - calls both data sources
 */
function masterDailyUpdate() {
  Logger.log('=== MASTER DAILY UPDATE STARTED ===');
  Logger.log('Time: ' + new Date().toISOString());
  
  // Track results
  const results = {
    snotel: { success: false, message: '' },
    nws: { success: false, message: '' }
  };
  
  // 1. Run SNOTEL update
  Logger.log('\n--- SNOTEL Update ---');
  try {
    dailyUpdate();  // From SNOTEL Snow Depth Data.gs
    results.snotel.success = true;
    results.snotel.message = 'Completed successfully';
    Logger.log('✓ SNOTEL update completed');
  } catch (e) {
    results.snotel.message = e.message;
    Logger.log('✗ SNOTEL update failed: ' + e.message);
  }
  
  // Small delay between data sources
  Utilities.sleep(2000);
  
  // 2. Run NWS HYD update
  Logger.log('\n--- NWS HYD Update ---');
  try {
    dailyNWSUpdate();  // From NWS HYD, NOAA CDO.gs
    results.nws.success = true;
    results.nws.message = 'Completed successfully';
    Logger.log('✓ NWS HYD update completed');
  } catch (e) {
    results.nws.message = e.message;
    Logger.log('✗ NWS HYD update failed: ' + e.message);
  }
  
  // Log summary
  Logger.log('\n=== UPDATE SUMMARY ===');
  Logger.log('SNOTEL: ' + (results.snotel.success ? '✓' : '✗') + ' ' + results.snotel.message);
  Logger.log('NWS HYD: ' + (results.nws.success ? '✓' : '✗') + ' ' + results.nws.message);
  Logger.log('=== MASTER DAILY UPDATE FINISHED ===');
  
  return results;
}

/**
 * Creates a single daily trigger at 6 AM for the master update
 */
function createMasterDailyTrigger() {
  // Remove all existing daily triggers
  removeAllDailyTriggers();
  
  // Create new trigger
  ScriptApp.newTrigger('masterDailyUpdate')
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .create();
  
  Logger.log('✓ Master daily trigger created (runs at 6 AM)');
  SpreadsheetApp.getUi().alert(
    'Master Trigger Created',
    'Daily update will run at 6 AM and update both:\n• SNOTEL stations\n• NWS HYD stations',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/**
 * Removes all daily update triggers (master, SNOTEL, and NWS)
 */
function removeAllDailyTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  const targetFunctions = ['masterDailyUpdate', 'dailyUpdate', 'dailyNWSUpdate'];
  
  for (const trigger of triggers) {
    if (targetFunctions.includes(trigger.getHandlerFunction())) {
      ScriptApp.deleteTrigger(trigger);
      Logger.log('Removed trigger: ' + trigger.getHandlerFunction());
    }
  }
}

/**
 * Add menu items for the controller
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🗓️ Daily Updates')
    .addItem('▶️ Run Master Update Now', 'masterDailyUpdate')
    .addSeparator()
    .addItem('⏰ Create Master Daily Trigger (6 AM)', 'createMasterDailyTrigger')
    .addItem('🗑️ Remove All Daily Triggers', 'removeAllDailyTriggers')
    .addToUi();
}
