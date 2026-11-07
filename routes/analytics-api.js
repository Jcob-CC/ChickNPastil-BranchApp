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
        averageMargin: 0,
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
        labels: sales.map(item => item.sales_date),
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

        const totalPayments =
            transactions.total || 1;

        res.json({

            transactions: transactions.total,

            matched: matched.total,

            review: review.total,

            discrepancy: 0,

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

    const wastageCount =
        commissaryDb.prepare(`
            SELECT COUNT(*) AS total
            FROM wastages
        `).get();

    const totalCost =
        commissaryDb.prepare(`
        SELECT IFNULL(
            SUM(estimated_cost),
            0
        ) AS total
        FROM wastages
    `).get();

    const topItem = commissaryDb.prepare(`
    SELECT item_name,
           SUM(quantity) AS qty
    FROM wastages
    GROUP BY item_name
    ORDER BY qty DESC
    LIMIT 1
`).get();

    const wastages = commissaryDb.prepare(`
    SELECT *
    FROM wastages
    ORDER BY date_recorded DESC
`).all();

    const topBranch =
        commissaryDb.prepare(`
        SELECT
            branch_name,
            SUM(estimated_cost) AS total_cost
        FROM wastages
        GROUP BY branch_name
        ORDER BY total_cost DESC
        LIMIT 1
    `).get();

    res.json({
        totalCost: totalCost.total,
        incidents: wastageCount.total,
        topItem: topItem?.item_name || 'N/A',
        topBranch:
            topBranch?.branch_name ||
            'N/A',
        wastages
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

        const expenses = {
            total: 0
        };

        const profit =
            branch.revenue - expenses.total;

        const margin =
            branch.revenue > 0
                ? ((profit / branch.revenue) * 100)
                : 0;

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

module.exports = router;