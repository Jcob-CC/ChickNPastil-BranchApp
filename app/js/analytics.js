fetch('/api/analytics/financial-overview')
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
                ? ((data.profit / data.revenue) * 100).toFixed(1)
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

function createCharts(data) {

    const revenueCanvas =
        document.getElementById('revenueChart');

    if (revenueCanvas) {

        new Chart(revenueCanvas, {

            type: 'line',

            data: {
                labels: [
                    'Sep 19',
                    'Sep 20',
                    'Sep 21',
                    'Sep 22',
                    'Sep 23',
                    'Sep 24',
                    'Sep 25',
                ],

                datasets: [
                    {
                        label: 'Revenue',
                        data: [95000, 85000, 42000, 40000, 50000, 60000, 78000],
                        borderColor: '#2c9f60',
                        fill: true,
                        tension: .4
                    },

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
    }

    const paymentCanvas =
        document.getElementById('paymentChart');

    if (paymentCanvas) {

        new Chart(paymentCanvas, {
            type: 'pie',

            data: {
                labels: ['Cash', 'GCash'],
                datasets: [{
                    data: [data.cash, data.gcash],
                    backgroundColor: [
                        '#2c9f60',
                        '#133d2a'
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
