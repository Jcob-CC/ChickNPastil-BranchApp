console.log("Payment Audit Loaded");

let statusChart = null;
let paymentChart = null;

async function loadPaymentAudit() {

    try {

        const date =
            document.getElementById('dateFilter')?.value || '';

        const branch =
            document.getElementById('branchFilter')?.value || 'all';

        const status =
            document.getElementById('statusFilter')?.value || 'all';

        const query = new URLSearchParams({
            date,
            branch,
            status
        });

        const data = await fetch(
            `/api/analytics/payment-audit?${query}`
        ).then(response => response.json());

        document.getElementById('transactions').innerText =
            data.transactions;

        document.getElementById('matched').innerText =
            data.matched;

        document.getElementById('review').innerText =
            data.review;

        document.getElementById('discrepancy').innerText =
            `₱${Number(data.discrepancy).toLocaleString()}`;

        document.getElementById('matchRate').innerText =
            `${data.matchedPercentage}% match rate`;

        document.getElementById('flaggedCount').innerText =
            `${data.review} flagged`;

        createCharts(data);

        const rows = await fetch(
            `/api/analytics/payment-log?${query}`
        ).then(response => response.json());

        renderTable(rows);

    } catch (error) {

        console.error(
            'Payment Audit Load Error:',
            error
        );

    }
}

function createCharts(data) {

    const statusCanvas =
        document.getElementById('statusChart');

    if (statusCanvas) {

        if (statusChart) {
            statusChart.destroy();
        }

        statusChart = new Chart(statusCanvas, {

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

        if (paymentChart) {
            paymentChart.destroy();
        }

        paymentChart = new Chart(paymentCanvas, {

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

function renderTable(rows) {

    const tbody =
        document.getElementById('paymentAuditBody');

    if (!tbody) return;

    tbody.innerHTML = '';

    if (!rows.length) {

        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center">
                    No transactions found
                </td>
            </tr>
        `;

        return;
    }

    rows.forEach(payment => {

        const difference =
            payment.amount_paid -
            payment.amount_due;

        tbody.innerHTML += `
            <tr>

                <td>
                    ${new Date(payment.paid_at)
                        .toLocaleDateString(
                            'en-US',
                            {
                                month: 'short',
                                day: '2-digit',
                                year: 'numeric'
                            }
                        )}
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

                    ${
                        payment.payment_status === 'Verified'
                            ? 'Matched'
                            : 'For Review'
                    }

                </td>

            </tr>
        `;
    });
}

document
    .getElementById('dateFilter')
    ?.addEventListener(
        'change',
        loadPaymentAudit
    );

document
    .getElementById('branchFilter')
    ?.addEventListener(
        'change',
        loadPaymentAudit
    );

document
    .getElementById('statusFilter')
    ?.addEventListener(
        'change',
        loadPaymentAudit
    );

loadPaymentAudit();