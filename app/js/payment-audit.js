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
                        '#2D6E36',
                        '#BE2D2D'
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
                        '#2D6E36',
                        '#BE2D2D'
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

fetch('/api/analytics/payment-log')
    .then(response => response.json())
    .then(rows => {

        const tbody =
            document.getElementById('paymentAuditBody');

        if (!tbody) return;

        tbody.innerHTML = '';

        rows.forEach(payment => {

            const difference =
                payment.amount_paid -
                payment.amount_due;

            tbody.innerHTML += `
                <tr>

                    <td>
                        ${new Date(payment.paid_at)
                            .toLocaleDateString('en-US', {
                                month: 'short',
                                day: '2-digit',
                                year: 'numeric'
                            })}
                    </td>

                    <td>
                        ${payment.payment_method}
                    </td>

                    <td>
                        ₱${Number(payment.amount_due)
                            .toLocaleString()}
                    </td>

                    <td>
                        ₱${Number(payment.amount_paid)
                            .toLocaleString()}
                    </td>

                    <td>
                        ₱${Number(difference)
                            .toLocaleString()}
                    </td>

                    <td class="${
                        payment.payment_status === 'Verified'
                            ? 'positive'
                            : 'negative'
                    }">
                        ${payment.payment_status}
                    </td>

                </tr>
            `;

        });

    })
    .catch(error => {
        console.error(error);
    });