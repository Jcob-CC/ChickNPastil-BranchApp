const express = require('express');
const router = express.Router();

const db = require('../lib/database');
const commissaryDb = require('../lib/commissary-db');

const fs = require('fs');
const path = require('path');

router.get('/api/analytics/financial-overview', (req, res) => {

    const revenue = db.prepare(`
        SELECT IFNULL(SUM(order_total),0) AS total
        FROM orders
        WHERE order_status='Completed'
    `).get();


    const transactions = db.prepare(`
        SELECT COUNT(*) AS total
        FROM orders
        WHERE order_status='Completed'
    `).get();


    const cash = db.prepare(`
        SELECT COUNT(*) AS total
        FROM payments
        WHERE payment_method='Cash'
        AND payment_status='Verified'
    `).get();

    const gcash = db.prepare(`
        SELECT COUNT(*) AS total
        FROM payments
        WHERE payment_method='GCash'
        AND payment_status='Verified'
    `).get();

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

    const rows = db.prepare(`
        SELECT
            DATE(order_datetime) AS date,
            COUNT(*) AS transactions,
            SUM(order_total) AS revenue
        FROM orders
        WHERE order_status = 'Completed'
        GROUP BY DATE(order_datetime)
        ORDER BY DATE(order_datetime) DESC
        LIMIT 7
    `).all();

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

    const branches = db.prepare(`
        SELECT
            branch_name,
            SUM(order_total) AS revenue
        FROM orders
        WHERE order_status='Completed'
        GROUP BY branch_name
        ORDER BY revenue DESC
    `).all();

    if (branches.length === 0) {
        return res.json({
            highest: 'N/A',
            lowest: 'N/A',
            averageMargin: 100,
            activeBranches: 0,
            branches: []
        });
    }

    const highest = branches[0];
    const lowest = branches[branches.length - 1];

    res.json({
        highest: highest.branch_name,
        highestMargin: highest.revenue,
        lowest: lowest.branch_name,
        lowestMargin: lowest.revenue,
        averageMargin: 'N/A',
        activeBranches: branches.length,
        branches
    });

});

router.get('/api/analytics/sales-trends', (req, res) => {

    const sales = db.prepare(`
        SELECT
            DATE(order_datetime) as sales_date,
            SUM(order_total) as total_sales
        FROM orders
        WHERE order_status = 'Completed'
        GROUP BY DATE(order_datetime)
        ORDER BY sales_date
        LIMIT 7
    `).all();

    res.json({
        labels: sales.map(item => {
            const date = new Date(item.sales_date);

            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: '2-digit'
            });
        }),

        dailySales: sales.map(item => item.total_sales)
    });
});

router.get(
    '/api/analytics/payment-audit',
    (req, res) => {

        const transactions =
            db.prepare(`
                SELECT COUNT(*) AS total
                FROM payments
            `).get();

        const matched =
            db.prepare(`
                SELECT COUNT(*) AS total
                FROM payments
                WHERE payment_status='Verified'
            `).get();

        const review =
            db.prepare(`
                SELECT COUNT(*) AS total
                FROM payments
                WHERE payment_status!='Verified'
            `).get();

        const cash =
            db.prepare(`
                SELECT COUNT(*) AS total
                FROM payments
                WHERE payment_method='Cash'
            `).get();

        const gcash =
            db.prepare(`
                SELECT COUNT(*) AS total
                FROM payments
                WHERE payment_method='GCash'
            `).get();

        const discrepancy =
            db.prepare(`
                SELECT
                    IFNULL(
                        SUM(
                            ABS(amount_paid - amount_due)
                        ),
                        0
                    ) AS total
                FROM payments
            `).get();

        const totalPayments =
            transactions.total || 1;

        res.json({

            transactions: transactions.total,

            matched: matched.total,

            review: review.total,

            discrepancy: discrepancy.total,

            matchedPercentage:
                Math.round(
                    (matched.total / totalPayments) * 100
                ),

            reviewPercentage:
                Math.round(
                    (review.total / totalPayments) * 100
                ),

            cash: cash.total,

            gcash: gcash.total

        });

    }
);

router.get('/api/analytics/wastage-insights', (req, res) => {
    res.json({
        totalCost: 0,
        incidents: 0,
        topItem: 'N/A',
        topBranch: 'N/A',
        wastages: []
    });
});


router.get('/api/analytics/branch-performance', (req, res) => {

    const branches = db.prepare(`
        SELECT
            branch_name,
            IFNULL(SUM(order_total),0) AS revenue
        FROM orders
        WHERE order_status='Completed'
        GROUP BY branch_name
        ORDER BY revenue DESC
    `).all();

    const result = branches.map((branch, index) => {

        const expenses = null;

        const profit = null;

        const margin = null;

        return {
            rank: index + 1,
            branch: branch.branch_name,
            revenue: branch.revenue,
            expenses: expenses.total,
            profit,
            margin: margin.toFixed(1)
        };

    });

    res.json(result);

});

router.get('/api/analytics/sales-insights', (req, res) => {

    const peakHour = db.prepare(`
        SELECT
            strftime('%H', order_datetime) AS hour,
            COUNT(*) AS total_orders
        FROM orders
        WHERE order_status = 'Completed'
        GROUP BY hour
        ORDER BY total_orders DESC
        LIMIT 1
    `).get();

    const peakDay = db.prepare(`
        SELECT
            DATE(order_datetime) AS sales_day,
            SUM(order_total) AS revenue
        FROM orders
        WHERE order_status = 'Completed'
        GROUP BY DATE(order_datetime)
        ORDER BY revenue DESC
        LIMIT 1
    `).get();

    const highestBranch = db.prepare(`
        SELECT
            branch_name,
            SUM(order_total) AS revenue
        FROM orders
        WHERE order_status = 'Completed'
        GROUP BY branch_name
        ORDER BY revenue DESC
        LIMIT 1
    `).get();

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

        WHERE order_status='Completed'

        GROUP BY period

        ORDER BY revenue DESC

        LIMIT 1
    `).get();

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

    const branches = db.prepare(`
        SELECT DISTINCT branch_name
        FROM orders
        WHERE order_status = 'Completed'
    `).all();

    const result = branches.map(branch => {

        const peakHour = db.prepare(`
            SELECT
                strftime('%H', order_datetime) AS hour,
                COUNT(*) AS total_orders
            FROM orders
            WHERE order_status = 'Completed'
            AND branch_name = ?
            GROUP BY hour
            ORDER BY total_orders DESC
            LIMIT 1
        `).get(branch.branch_name);

        const peakDay = db.prepare(`
            SELECT
                DATE(order_datetime) AS sales_day,
                SUM(order_total) AS sales
            FROM orders
            WHERE order_status = 'Completed'
            AND branch_name = ?
            GROUP BY DATE(order_datetime)
            ORDER BY sales DESC
            LIMIT 1
        `).get(branch.branch_name);

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
                        day: '2-digit',
                        year: 'numeric'
                    })
                : 'N/A',
                 sales: peakDay?.sales || 0
        };
    });

    res.json(result);

});


router.get('/api/analytics/branch-peak-summary', (req, res) => {

    const branches = db.prepare(`
        SELECT DISTINCT branch_name
        FROM orders
        WHERE order_status = 'Completed'
    `).all();

    const result = branches.map(branch => {

        const peakHour = db.prepare(`
            SELECT
                strftime('%H', order_datetime) AS hour,
                COUNT(*) AS total_orders
            FROM orders
            WHERE order_status = 'Completed'
            AND branch_name = ?
            GROUP BY hour
            ORDER BY total_orders DESC
            LIMIT 1
        `).get(branch.branch_name);

        const peakDay = db.prepare(`
            SELECT
                DATE(order_datetime) AS sales_day,
                SUM(order_total) AS sales
            FROM orders
            WHERE order_status = 'Completed'
            AND branch_name = ?
            GROUP BY DATE(order_datetime)
            ORDER BY sales DESC
            LIMIT 1
        `).get(branch.branch_name);

        return {
            branch_name: branch.branch_name,
            peakHour: peakHour?.hour
                ? `${peakHour.hour}:00`
                : 'N/A',
            peakDay: peakDay?.sales_day || 'N/A',
            sales: peakDay?.sales || 0
        };

    });

    res.json(result);

});


router.get('/api/analytics/hourly-sales', (req, res) => {

    const rows = db.prepare(`
        SELECT
            strftime('%H', order_datetime) AS hour,
            SUM(order_total) AS sales
        FROM orders
        WHERE order_status = 'Completed'
        GROUP BY hour
        ORDER BY hour
    `).all();

    res.json({
        labels: rows.map(row => `${row.hour}:00`),
        sales: rows.map(row => row.sales)
    });

});

router.get('/api/analytics/daily-sales', (req, res) => {

    const rows = db.prepare(`
        SELECT
            strftime('%w', order_datetime) AS day_num,
            SUM(order_total) AS sales
        FROM orders
        WHERE order_status = 'Completed'
        GROUP BY day_num
        ORDER BY day_num
    `).all();

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
        labels: rows.map(row => dayNames[Number(row.day_num)]),
        sales: rows.map(row => row.sales)
    });

});

router.get('/api/analytics/payment-log', (req, res) => {

    const rows = db.prepare(`
        SELECT
            payment_method,
            amount_due,
            amount_paid,
            payment_status,
            paid_at
        FROM payments
        ORDER BY paid_at DESC
        LIMIT 20
    `).all();

    res.json(rows);

});
module.exports = router;