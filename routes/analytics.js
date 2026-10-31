const express = require("express");
const path = require("path");

const router = express.Router();

router.get("/analytics/financial-overview", (req, res) => {
    res.sendFile(
        path.join(
            __dirname,
            "..",
            "app",
            "pages",
            "analytics",
            "financial-overview.html"
        )
    );
});
router.get("/analytics/branch-profitability", (req, res) => {
    res.sendFile(
        path.join(
            __dirname,
            "..",
            "app",
            "pages",
            "analytics",
            "branch-profitability.html"
        )
    );

});
router.get(
    '/analytics/sales-trends',
    (req, res) => {
        res.sendFile(
            path.join(
                __dirname,
                '..',
                'app/pages/analytics/sales-trends.html'
            )
        );
    }
);

router.get(
    '/analytics/payment-audit',
    (req, res) => {
        res.sendFile(
            path.join(
                __dirname,
                '..',
                'app/pages/analytics/payment-audit.html'
            )
        );
    }
);

router.get(
    '/analytics/wastage-insights',
    (req,res)=>{
        res.sendFile(
            path.join(
                __dirname,
                '..',
                'app/pages/analytics/wastage-insights.html'
            )
        );
    }
);

module.exports = router;