function writeRowsToBigQuery(rows) {
  const projectId = 'snow-depth-viz';
  const datasetId = 'snow_data';
  const tableId = 'observations';
  
  const rowObjects = rows.map(row => ({
    json: {
      date: row[0],
      station: row[1],
      station_id: row[2],
      state: row[3],
      snow_depth_in: row[4],
      water_year: row[5],
      day_of_wy: row[6],
      month: row[7],
      month_num: row[8],
      is_current_wy: row[9],
      last_updated: row[10],
      source: row[11]
    }
  }));
  
  BigQuery.Tabledata.insertAll({rows: rowObjects}, projectId, datasetId, tableId);
}