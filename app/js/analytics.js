let revenueChart = null;
let paymentChart = null;

function loadFinancialOverview() {

    const date =
        document.getElementById('dateFilter')?.value || '';

    const branch =
        document.getElementById('branchFilter')?.value || 'all';

    const query = new URLSearchParams({
        date,
        branch
    });

    fetch(`/api/analytics/financial-overview?${query}`)
        .then(response => response.json())
        .then(data => {

            document.getElementById('revenue').innerText =
                '₱' + Number(data.revenue).toLocaleString();

            document.getElementById('expenses').innerText =
                '₱' + Number(data.expenses).toLocaleString();

            document.getElementById('profit').innerText =
                '₱' + Number(data.profit).toLocaleString();

            const margin =
                data.revenue > 0
                    ? (
                        (data.profit / data.revenue) *
                        100
                    ).toFixed(1)
                    : 0;

            document.getElementById('profitMargin')
                .innerText =
                `Margin ${margin}%`;

            fetch('/api/analytics/wastage-insights')
                .then(response => response.json())
                .then(wastage => {

                    document.getElementById('wastageCost')
                        .innerText =
                        '₱' +
                        Number(
                            wastage.totalCost
                        ).toLocaleString();

                    const impact =
                        data.profit > 0
                            ? (
                                wastage.totalCost /
                                data.profit
                            ) * 100
                            : 0;

                    document.getElementById('wastageImpact')
                        .innerText =
                        impact.toFixed(1) +
                        '% of profit';

                });

            createCharts(data);

        })
        .catch(error => {
            console.error(error);
        });

    fetch(`/api/analytics/financial-summary?${query}`)
        .then(response => response.json())
        .then(rows => {

            const tbody =
                document.getElementById(
                    'financialSummaryBody'
                );

            if (!tbody) return;

            tbody.innerHTML = rows.map(row => `
                <tr>
                    <td>
                        ${new Date(row.date)
                    .toLocaleDateString(
                        'en-PH',
                        {
                            year: 'numeric',
                            month: 'short',
                            day: '2-digit'
                        }
                    )}
                    </td>

                    <td>
                        ₱${Number(row.revenue)
                    .toLocaleString()}
                    </td>

                    <td>
                        ₱${Number(row.expenses)
                    .toLocaleString()}
                    </td>

                    <td>
                        ₱${Number(row.profit)
                    .toLocaleString()}
                    </td>

                    <td>
                        ${row.margin}%
                    </td>

                </tr>
            `).join('');

        })
        .catch(error => {
            console.error(
                'Financial summary error:',
                error
            );
        });

}

function createCharts(data) {

    const revenueCanvas =
        document.getElementById('revenueChart');

    if (revenueCanvas) {

    if (revenueChart) {
        revenueChart.destroy();
    }

    const date =
        document.getElementById('dateFilter')?.value || '';

    const branch =
        document.getElementById('branchFilter')?.value || 'all';

    const query =
        new URLSearchParams({
            date,
            branch
        });
        fetch(`/api/analytics/sales-trends?${query}`)
            .then(response => response.json())
            .then(chartData => {

                revenueChart =
                    new Chart(revenueCanvas, {

                        type: 'line',

                        data: {
                            labels: chartData.labels,

                            datasets: [
                                {
                                    label: 'Revenue',

                                    data:
                                        chartData.dailySales,

                                    borderColor:
                                        '#2c9f60',

                                    backgroundColor:
                                        'rgba(44,159,96,0.15)',

                                    fill: true,

                                    tension: 0.4
                                }
                            ]
                        },

                        options: {
                            responsive: true,

                            maintainAspectRatio: false,

                            layout: {
                                padding: {
                                    bottom: 30
                                }
                            }
                        }

                    });

            })
            .catch(error => {
                console.error(
                    'Sales chart error:',
                    error
                );
            });

    }

    const paymentCanvas =
        document.getElementById('paymentChart');

    if (paymentCanvas) {

        if (paymentChart) {
            paymentChart.destroy();
        }

        paymentChart =
            new Chart(paymentCanvas, {

                type: 'pie',

                data: {

                    labels: [
                        'Cash',
                        'GCash'
                    ],

                    datasets: [{

                        data: [
                            data.cash,
                            data.gcash
                        ],

                        backgroundColor: [
                            '#2D6E36',
                            '#BE2D2D'
                        ]

                    }]

                },

                options: {

                    responsive: true,

                    maintainAspectRatio: false,

                    plugins: {

                        legend: {

                            position: 'right',

                            labels: {

                                usePointStyle: true,

                                pointStyle: 'circle',

                                padding: 20

                            }

                        }

                    }

                }

            });

    }

}

document.querySelectorAll('.summary-tab')
    .forEach(button => {

        button.addEventListener(
            'click',
            () => {

                document
                    .querySelectorAll('.summary-tab')
                    .forEach(btn =>
                        btn.classList.remove('active')
                    );

                button.classList.add('active');

                const period =
                    button.dataset.period;

                console.log(
                    'Selected:',
                    period
                );

            }
        );

    });

document
    .getElementById('dateFilter')
    ?.addEventListener(
        'change',
        loadFinancialOverview
    );

document
    .getElementById('branchFilter')
    ?.addEventListener(
        'change',
        loadFinancialOverview
    );

loadFinancialOverview();