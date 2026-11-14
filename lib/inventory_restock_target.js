const getAverageDailyReductions = (db, branchLocationId) => {
    const rows = db.prepare(`
        SELECT bil.branch_inventory_item_id,
               SUM(bil.value_before - bil.value_after) / 7.0 AS average_daily_quantity_reduction
        FROM branch_inventory_manager_log bil
        WHERE bil.branch_location_id = ?
          AND datetime(bil.date_and_time) >= datetime('now', '-7 days')
          AND datetime(bil.date_and_time) <= datetime('now')
          AND bil.value_before > bil.value_after
          AND lower(trim(COALESCE(bil.reason, ''))) IN ('offline sale', 'sold menu item')
        GROUP BY bil.branch_inventory_item_id
    `).all(branchLocationId);

    return new Map(rows.map((row) => [
        row.branch_inventory_item_id,
        Number(row.average_daily_quantity_reduction),
    ]));
};

const getEffectiveRestockTarget = (item, averageDailyReductions) => {
    const average = averageDailyReductions.get(item.branch_inventory_item_id);
    return item.auto_restock_target && average !== undefined &&
        average >= Number(item.low_quantity_threshold)
        ? Math.ceil(average)
        : item.restock_target_quantity;
};

module.exports = { getAverageDailyReductions, getEffectiveRestockTarget };
