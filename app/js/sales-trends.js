fetch('/api/analytics/sales-insights')
    .then(response => response.json())
    .then(data => {

        document.getElementById('peakHour').innerText =
            data.peakSalesHour;

        document.getElementById('peakDay').innerText =
            data.peakSalesDay;

        document.getElementById('topBranch').innerText =
            data.highestSalesBranch;

        document.getElementById('bestPeriod').innerText =
            data.bestSalesPeriod;

        document.getElementById('topBranchSales')
            .innerText =
            '₱' +
            Number(
                data.highestSalesRevenue
            ).toLocaleString() +
            ' (7d)';

        document.getElementById('peakHourNote')
            .innerText =
            'Based on completed orders';

    })
    .catch(error => {
        console.error(error);
    });

fetch('/api/analytics/sales-trends')
    .then(response => response.json())
    .then(data => {

        const trendCanvas =
            document.getElementById('salesTrendChart');

        if (trendCanvas) {

            new Chart(trendCanvas, {

                type: 'line',

                data: {

                    labels: data.labels,

                    datasets: [{

                        label: 'Sales',

                        data: data.dailySales,

                        borderColor: '#7b1e1e',
                        backgroundColor: 'rgba(123,30,30,.10)',
                        fill: true,
                        tension: .4

                    }]

                },

                options: {
                    responsive: true,
                    maintainAspectRatio: false,

                    plugins: {
                        legend: {
                            display: false
                        }
                    }
                }

            });

        }

    });

const hourlyCanvas =
    document.getElementById('hourlySalesChart');

if (hourlyCanvas) {

    new Chart(hourlyCanvas, {

        type: 'bar',

        data: {

            labels: [
                '9AM',
                '11AM',
                '1PM',
                '3PM',
                '5PM',
                '7PM',
                '9PM'
            ],

            datasets: [{

                label: 'Sales',

                data: [
                    32300,
                    82800,
                    124200,
                    55200,
                    96600,
                    149700,
                    63100
                ],

                backgroundColor: '#d58a1f',
                borderRadius: 10

            }]

        },

        options: {

            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,

            plugins: {
                legend: {
                    display: false
                }
            }

        }

    });

}

const dayCanvas =
    document.getElementById('dailySalesChart');

if (dayCanvas) {

    new Chart(dayCanvas, {

        type: 'bar',

        data: {

            labels: [
                'Mon',
                'Tue',
                'Wed',
                'Thu',
                'Fri',
                'Sat',
                'Sun'
            ],

            datasets: [{

                label: 'Sales',

                data: [
                    68600,
                    66700,
                    73000,
                    79200,
                    95700,
                    116300,
                    104400
                ],

                backgroundColor: '#153d29',
                borderRadius: 10

            }]

        },

        options: {

            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,

            plugins: {
                legend: {
                    display: false
                }
            }

        }

    });

}

fetch('/api/analytics/branch-sales-summary')
    .then(response => response.json())
    .then(data => {

        const tbody =
            document.getElementById(
                'branchPeakSummaryBody'
            );

        if (!tbody) return;

        tbody.innerHTML = '';

        data.forEach(branch => {

    const status =
        branch.sales >= 3000
            ? 'Strong'
            : branch.sales >= 1000
            ? 'Stable'
            : 'Watch';

    tbody.innerHTML += `
        <tr>
            <td>${branch.branch_name}</td>
            <td>06:00</td>
            <td>2026-10-24</td>
            <td>₱${Number(branch.sales).toLocaleString()}</td>
            <td>${status}</td>
        </tr>
    `;

});

    })
    .catch(error => {
        console.error(error);
    });