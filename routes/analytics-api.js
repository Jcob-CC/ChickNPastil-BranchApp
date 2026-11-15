const express = require('express');
const router = express.Router();

const db = require('../lib/database');
const commissaryDb = require('../lib/commissary-db');

const fs = require('fs');
const path = require('path');

router.get('/api/analytics/financial-overview', (req, res) => {

    const { date, branch } = req.query;

    let whereClause = `
    WHERE order_status='Completed'
`;

    const params = [];

    if (date) {
        whereClause += `
        AND DATE(order_datetime) = ?
    `;
        params.push(date);
    }

    if (branch && branch !== 'all') {
        whereClause += `
        AND branch_name = ?
    `;
        params.push(branch);
    }

    const revenue = db.prepare(`
    SELECT IFNULL(SUM(order_total),0) AS total
    FROM orders
    ${whereClause}
`).get(...params);


    const transactions = db.prepare(`
    SELECT COUNT(*) AS total
    FROM orders
    ${whereClause}
`).get(...params);


    const cash = db.prepare(`
    SELECT COUNT(*) AS total
    FROM payments p
    JOIN orders o
        ON o.order_id = p.order_id
    WHERE p.payment_method='Cash'
    AND p.payment_status='Verified'
    ${branch && branch !== 'all'
            ? 'AND o.branch_name = ?'
            : ''}
`).get(...(
                branch && branch !== 'all'
                    ? [branch]
                    : []
            ));

    const gcash = db.prepare(`
    SELECT COUNT(*) AS total
    FROM payments p
    JOIN orders o
        ON o.order_id = p.order_id
    WHERE p.payment_method='GCash'
    AND p.payment_status='Verified'
    ${branch && branch !== 'all'
            ? 'AND o.branch_name = ?'
            : ''}
`).get(...(
                branch && branch !== 'all'
                    ? [branch]
                    : []
            ));

    const expenses = db.prepare(`
        SELECT IFNULL(SUM(total_price),0) AS total
        FROM branch_expense_request
        WHERE status='approved'
    `).get();

    res.json({
        revenue: revenue.total,
        expenses: expenses.total,
        profit: revenue.total - expenses.total,
        transactions: transactions.total,
        cash: cash.total,
        gcash: gcash.total
    });

});

router.get('/api/analytics/financial-summary', (req, res) => {

    const { branch, period = 'daily' } = req.query;

    let query = '';
    const params = [];

    if (period === 'daily') {

        query = `
            SELECT
                DATE(order_datetime) AS date,
                SUM(order_total) AS revenue
            FROM orders
            WHERE order_status = 'Completed'
        `;

        if (branch && branch !== 'all') {
            query += ` AND branch_name = ?`;
            params.push(branch);
        }

        query += `
            GROUP BY DATE(order_datetime)
            ORDER BY DATE(order_datetime) DESC
            LIMIT 31
        `;

    } else if (period === 'weekly') {

        query = `
        SELECT
            DATE(order_datetime, 'weekday 0', '-6 days') AS date,
            SUM(order_total) AS revenue
        FROM orders
        WHERE order_status = 'Completed'
    `;

        if (branch && branch !== 'all') {
            query += ` AND branch_name = ?`;
            params.push(branch);
        }

        query += `
        GROUP BY DATE(order_datetime, 'weekday 0', '-6 days')
        ORDER BY date DESC
        LIMIT 12
    `;

    } else {


        query = `
            SELECT
                strftime('%Y-%m', order_datetime) AS date,
                SUM(order_total) AS revenue
            FROM orders
            WHERE order_status = 'Completed'
        `;

        if (branch && branch !== 'all') {
            query += ` AND branch_name = ?`;
            params.push(branch);
        }

        query += `
            GROUP BY strftime('%Y-%m', order_datetime)
            ORDER BY date DESC
            LIMIT 12
        `;
    }

    const rows = db.prepare(query).all(...params);

    const result = rows.map(row => ({
        date: row.date,
        revenue: row.revenue,
        expenses: 0,
        profit: row.revenue,
        margin: 100
    }));

    res.json(result);

});

router.get('/api/analytics/branch-profitability', (req, res) => {

    const { date, branch } = req.query;

    let query = `
        SELECT
            branch_name,
            SUM(order_total) AS revenue
        FROM orders
        WHERE order_status = 'Completed'
    `;

    const params = [];

    if (date) {
        query += `
            AND DATE(order_datetime) = ?
        `;
        params.push(date);
    }

    if (
        branch &&
        branch !== 'all' &&
        branch !== 'All Branches'
    ) {
        query += `
            AND branch_name = ?
        `;
        params.push(branch);
    }

    query += `
        GROUP BY branch_name
        ORDER BY revenue DESC
    `;

    const branches =
        db.prepare(query).all(...params);

    if (branches.length === 0) {
        return res.json({
            highest: 'N/A',
            lowest: 'N/A',
            averageMargin: 0,
            activeBranches: 0,
            branches: []
        });
    }

    const highest = branches[0];
    const lowest = branches[branches.length - 1];

    const averageRevenue =
        branches.reduce(
            (sum, branch) =>
                sum + Number(branch.revenue || 0),
            0
        ) / branches.length;

    res.json({
        highest: highest.branch_name,
        highestMargin: highest.revenue,
        lowest: lowest.branch_name,
        lowestMargin: lowest.revenue,
        averageMargin: Number(
            averageRevenue.toFixed(0)
        ),
        activeBranches: branches.length,
        branches
    });

});

router.get('/api/analytics/sales-trends', (req, res) => {

    const { date, branch } = req.query;

    let query = `
        SELECT
            DATE(order_datetime) AS sales_date,
            SUM(order_total) AS total_sales
        FROM orders
        WHERE order_status = 'Completed'
    `;

    const params = [];

    if (date) {
        query += `
            AND DATE(order_datetime) = ?
        `;
        params.push(date);
    }

    if (branch && branch !== 'all') {
        query += `
            AND branch_name = ?
        `;
        params.push(branch);
    }

    query += `
        GROUP BY DATE(order_datetime)
        ORDER BY sales_date
    `;

    const sales =
        db.prepare(query).all(...params);

    res.json({
        labels: sales.map(item => {
            const date = new Date(item.sales_date);

            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: '2-digit'
            });
        }),

        dailySales:
            sales.map(item => item.total_sales)
    });

});

router.get('/api/analytics/payment-audit', (req, res) => {

    const {
        date,
        branch,
        status
    } = req.query;

    let query = `
        SELECT
            p.*,
            o.branch_name
        FROM payments p
        JOIN orders o
            ON o.order_id = p.order_id
        WHERE 1=1
    `;

    const params = [];

    if (date) {
        query += `
            AND DATE(p.paid_at) = ?
        `;
        params.push(date);
    }

    if (branch && branch !== 'all') {
        query += `
            AND o.branch_name = ?
        `;
        params.push(branch);
    }

    if (status === 'matched') {
        query += `
            AND p.payment_status = 'Verified'
        `;
    }

    if (status === 'review') {
        query += `
            AND p.payment_status != 'Verified'
        `;
    }

    const rows =
        db.prepare(query).all(...params);

    const transactions =
        rows.length;

    const matched =
        rows.filter(
            row => row.payment_status === 'Verified'
        ).length;

    const review =
        rows.filter(
            row => row.payment_status !== 'Verified'
        ).length;

    const discrepancy =
        rows.reduce(
            (sum, row) =>
                sum +
                Math.abs(
                    Number(row.amount_paid) -
                    Number(row.amount_due)
                ),
            0
        );

    const cash =
        rows.filter(
            row => row.payment_method === 'Cash'
        ).length;

    const gcash =
        rows.filter(
            row => row.payment_method === 'GCash'
        ).length;

    const matchedPercentage =
        transactions > 0
            ? Math.round(
                (matched / transactions) * 100
            )
            : 0;

    const reviewPercentage =
        transactions > 0
            ? Math.round(
                (review / transactions) * 100
            )
            : 0;

    res.json({
        transactions,
        matched,
        review,
        discrepancy,
        cash,
        gcash,
        matchedPercentage,
        reviewPercentage
    });

});

router.get('/api/analytics/wastage-insights', (req, res) => {

    const wastages = db.prepare(`
        SELECT
            ber.id,
            bl.location_name AS branch_name,
            ber.total_price AS estimated_cost,
            ber.request_note AS reason,
            ber.date_and_time AS date_recorded,
            ber.status
        FROM branch_expense_request ber
        LEFT JOIN branch_location bl
            ON bl.id = ber.branch_location_id
        WHERE ber.status = 'approved'
        ORDER BY ber.date_and_time DESC
    `).all();

    const totalCost =
        wastages.reduce(
            (sum, item) =>
                sum + Number(item.estimated_cost || 0),
            0
        );

    const topBranch =
        wastages.length
            ? wastages.reduce(
                (max, item) =>
                    item.estimated_cost >
                        max.estimated_cost
                        ? item
                        : max
            ).branch_name
            : 'N/A';

    res.json({
        totalCost,
        incidents: wastages.length,
        topBranch,
        wastages
    });

});

router.get('/api/analytics/branch-performance', (req, res) => {

    const { date, branch } = req.query;

    let revenueQuery = `
        SELECT
            branch_name,
            SUM(order_total) AS revenue
        FROM orders
        WHERE order_status = 'Completed'
    `;

    const revenueParams = [];

    if (date) {
        revenueQuery += `
            AND DATE(order_datetime) = ?
        `;
        revenueParams.push(date);
    }

    if (
        branch &&
        branch !== 'all' &&
        branch !== 'All Branches'
    ) {
        revenueQuery += `
            AND branch_name = ?
        `;
        revenueParams.push(branch);
    }

    revenueQuery += `
        GROUP BY branch_name
    `;

    const revenueData =
        db.prepare(revenueQuery)
            .all(...revenueParams);

    const expenseData = db.prepare(`
        SELECT
            bl.location_name AS branch_name,
            SUM(ber.total_price) AS expenses
        FROM branch_expense_request ber
        JOIN branch_location bl
            ON bl.id = ber.branch_location_id
        WHERE ber.status = 'approved'
        GROUP BY bl.location_name
    `).all();

    const expenseMap = {};

    expenseData.forEach(row => {
        expenseMap[row.branch_name] =
            Number(row.expenses || 0);
    });

    const result = revenueData
        .map(branch => {

            const revenue =
                Number(branch.revenue || 0);

            const expenses =
                expenseMap[branch.branch_name] || 0;

            const profit =
                revenue - expenses;

            const margin =
                revenue > 0
                    ? (profit / revenue) * 100
                    : 0;

            return {
                branch: branch.branch_name,
                revenue,
                expenses,
                profit,
                margin: Number(
                    margin.toFixed(1)
                )
            };

        })
        .sort((a, b) => b.profit - a.profit)
        .map((branch, index) => ({
            ...branch,
            rank: index + 1
        }));

    res.json(result);

});

router.get('/api/analytics/sales-insights', (req, res) => {

    const { date, branch } = req.query;

    let whereClause = `
    WHERE order_status = 'Completed'
`;

    const params = [];

    if (date) {
        whereClause += `
        AND DATE(order_datetime) = ?
    `;
        params.push(date);
    }

    if (branch && branch !== 'all') {
        whereClause += `
        AND branch_name = ?
    `;
        params.push(branch);
    }

    const peakHour = db.prepare(`
    SELECT
        strftime('%H', order_datetime) AS hour,
        COUNT(*) AS total_orders
    FROM orders
    ${whereClause}
    GROUP BY hour
    ORDER BY total_orders DESC
    LIMIT 1
`).get(...params);

    const peakDay = db.prepare(`
    SELECT
        DATE(order_datetime) AS sales_day,
        SUM(order_total) AS revenue
    FROM orders
    ${whereClause}
    GROUP BY DATE(order_datetime)
    ORDER BY revenue DESC
    LIMIT 1
`).get(...params);

    const highestBranch = db.prepare(`
    SELECT
        branch_name,
        SUM(order_total) AS revenue
    FROM orders
    ${whereClause}
    GROUP BY branch_name
    ORDER BY revenue DESC
    LIMIT 1
`).get(...params);

    const bestPeriod = db.prepare(`
    SELECT
        CASE
            WHEN CAST(
                strftime('%H', order_datetime)
                AS INTEGER
            ) < 12
            THEN 'Morning'

            WHEN CAST(
                strftime('%H', order_datetime)
                AS INTEGER
            ) < 18
            THEN 'Afternoon'

            ELSE 'Evening'
        END AS period,

        SUM(order_total) AS revenue

    FROM orders

    ${whereClause}

    GROUP BY period

    ORDER BY revenue DESC

    LIMIT 1
`).get(...params);

    res.json({

        peakSalesHour:
            peakHour
                ? `${peakHour.hour}:00`
                : 'N/A',

        peakSalesDay:
            peakDay?.sales_day || 'N/A',

        highestSalesBranch:
            highestBranch?.branch_name || 'N/A',

        highestSalesRevenue:
            highestBranch?.revenue || 0,

        bestSalesPeriod:
            bestPeriod?.period || 'N/A'

    });

});

router.get('/api/analytics/branch-sales-summary', (req, res) => {

    const branches = db.prepare(`
        SELECT
            branch_name,
            SUM(order_total) AS sales
        FROM orders
        WHERE order_status='Completed'
        GROUP BY branch_name
        ORDER BY sales DESC
    `).all();

    res.json(branches);

});

router.get('/api/analytics/branch-peak-summary', (req, res) => {

    const { date, branch } = req.query;

    let branchQuery = `
        SELECT DISTINCT branch_name
        FROM orders
        WHERE order_status = 'Completed'
    `;

    const params = [];

    if (branch && branch !== 'all') {
        branchQuery += `
            AND branch_name = ?
        `;
        params.push(branch);
    }

    const branches =
        db.prepare(branchQuery).all(...params);

    const result = branches.map(branch => {

        const peakHour = db.prepare(`
            SELECT
                strftime('%H', order_datetime) AS hour,
                COUNT(*) AS total_orders
            FROM orders
            WHERE order_status = 'Completed'
            AND branch_name = ?
            ${date ? 'AND DATE(order_datetime) = ?' : ''}
            GROUP BY hour
            ORDER BY total_orders DESC
            LIMIT 1
        `).get(
            ...(date
                ? [branch.branch_name, date]
                : [branch.branch_name])
        );

        const peakDay = db.prepare(`
            SELECT
                DATE(order_datetime) AS sales_day,
                SUM(order_total) AS sales
            FROM orders
            WHERE order_status = 'Completed'
            AND branch_name = ?
            ${date ? 'AND DATE(order_datetime) = ?' : ''}
            GROUP BY DATE(order_datetime)
            ORDER BY sales DESC
            LIMIT 1
        `).get(
            ...(date
                ? [branch.branch_name, date]
                : [branch.branch_name])
        );

        return {
            branch_name: branch.branch_name,
            peakHour: peakHour?.hour
                ? new Date(
                    `2000-01-01 ${peakHour.hour}:00:00`
                ).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                })
                : 'N/A',
            peakDay: peakDay?.sales_day
                ? new Date(peakDay.sales_day)
                    .toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                    })
                : 'N/A',
            sales: peakDay?.sales || 0
        };

    });

    res.json(result);

});

router.get('/api/analytics/hourly-sales', (req, res) => {

    const { date, branch } = req.query;

    let query = `
        SELECT
            strftime('%H', order_datetime) AS hour,
            SUM(order_total) AS sales
        FROM orders
        WHERE order_status = 'Completed'
    `;

    const params = [];

    if (date) {
        query += `
            AND DATE(order_datetime) = ?
        `;
        params.push(date);
    }

    if (branch && branch !== 'all') {
        query += `
            AND branch_name = ?
        `;
        params.push(branch);
    }

    query += `
        GROUP BY hour
        ORDER BY hour
    `;

    const rows =
        db.prepare(query).all(...params);

    res.json({
        labels: rows.map(row => `${row.hour}:00`),
        sales: rows.map(row => row.sales)
    });

});

router.get('/api/analytics/daily-sales', (req, res) => {

    const { date, branch } = req.query;

    let query = `
        SELECT
            strftime('%w', order_datetime) AS day_num,
            SUM(order_total) AS sales
        FROM orders
        WHERE order_status = 'Completed'
    `;

    const params = [];

    if (date) {
        query += `
            AND DATE(order_datetime) = ?
        `;
        params.push(date);
    }

    if (branch && branch !== 'all') {
        query += `
            AND branch_name = ?
        `;
        params.push(branch);
    }

    query += `
        GROUP BY day_num
        ORDER BY day_num
    `;

    const rows =
        db.prepare(query).all(...params);

    const dayNames = [
        'Sun',
        'Mon',
        'Tue',
        'Wed',
        'Thu',
        'Fri',
        'Sat'
    ];

    res.json({
        labels: rows.map(
            row => dayNames[Number(row.day_num)]
        ),
        sales: rows.map(row => row.sales)
    });

});

router.get('/api/analytics/payment-log', (req, res) => {

    const {
        date,
        branch,
        status
    } = req.query;

    let query = `
        SELECT
            p.payment_method,
            p.amount_due,
            p.amount_paid,
            p.payment_status,
            p.paid_at,
            o.branch_name
        FROM payments p
        JOIN orders o
            ON o.order_id = p.order_id
        WHERE 1 = 1
    `;

    const params = [];

    if (date) {
        query += `
            AND DATE(p.paid_at) = ?
        `;
        params.push(date);
    }

    if (branch && branch !== 'all') {
        query += `
            AND o.branch_name = ?
        `;
        params.push(branch);
    }

    if (status === 'matched') {
        query += `
            AND p.payment_status = 'Verified'
        `;
    }

    if (status === 'review') {
        query += `
            AND p.payment_status != 'Verified'
        `;
    }

    query += `
        ORDER BY p.paid_at DESC
    `;

    const rows =
        db.prepare(query).all(...params);

    res.json(rows);
});

router.get('/api/analytics/strategic-insights', (req, res) => {

    const wastages = db.prepare(`
        SELECT
            bl.location_name AS branch_name,
            ber.total_price AS estimated_cost,
            ber.request_note AS reason,
            ber.date_and_time AS date_recorded
        FROM branch_expense_request ber
        LEFT JOIN branch_location bl
            ON bl.id = ber.branch_location_id
        WHERE ber.status = 'approved'
    `).all();

    if (!wastages.length) {
        return res.json([
            {
                branch: 'All Branches',
                recommendation:
                    'No approved expense records available for strategic analysis.'
            }
        ]);
    }

    const branchSummary = {};

    wastages.forEach(item => {

        const branch = item.branch_name || 'Unknown';

        if (!branchSummary[branch]) {

            branchSummary[branch] = {
                totalCost: 0,
                incidents: 0
            };

        }

        branchSummary[branch].totalCost +=
            Number(item.estimated_cost || 0);

        branchSummary[branch].incidents++;

    });

    const insights = [];

    Object.entries(branchSummary)
        .sort(
            (a, b) =>
                b[1].totalCost -
                a[1].totalCost
        )
        .forEach(([branch, stats]) => {

            insights.push({
                branch,
                recommendation:
                    `${branch} recorded ₱${stats.totalCost.toLocaleString()} in operational losses across ${stats.incidents} approved incident(s). Priority should be given to identifying recurring expense causes and reducing preventable losses.`
            });

        });
    res.json(insights);

});

module.exports = router;