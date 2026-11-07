console.log("Payment Audit Loaded");

fetch('/api/analytics/payment-audit')
    .then(response => response.json())
    .then(data => {

        document.getElementById('transactions').innerText =
            data.transactions;

        document.getElementById('matched').innerText =
            data.matched;

        document.getElementById('review').innerText =
            data.review;

        document.getElementById('discrepancy').innerText =
            '₱' + data.discrepancy;

        document.getElementById('matchRate').innerText =
            data.matchedPercentage + '% match rate';

        document.getElementById('flaggedCount').innerText =
            data.review + ' flagged';

        createCharts(data);

    });

function createCharts(data) {

    const statusCanvas =
        document.getElementById('statusChart');

    if (statusCanvas) {

        new Chart(statusCanvas, {

            type: 'pie',

            data: {

                labels: [
                    'Matched',
                    'For Review'
                ],

                datasets: [{

                    data: [
                        data.matchedPercentage,
                        data.reviewPercentage
                    ],

                    backgroundColor: [
                        '#2c9f60',
                        '#e74c3c'
                    ],

                    radius: '70%'

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

    const paymentCanvas =
        document.getElementById('paymentChart');

    if (paymentCanvas) {

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
                        '#133d2a',
                        '#d58a1f'
                    ],

                    radius: '70%'

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