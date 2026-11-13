fetch('/api/analytics/sales-insights')
    .then(response => response.json())
    .then(data => {

        const [hour] = data.peakSalesHour.split(':');

        document.getElementById('peakHour').innerText =
            new Date(
                `2000-01-01 ${hour}:00:00`
            ).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });

        document.getElementById('peakDay').innerText =
            new Date(data.peakSalesDay)
                .toLocaleDateString('en-US', {
                    month: 'short',
                    day: '2-digit',
                    year: 'numeric'
                });

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

                        borderColor: '#2D6E36',

                        backgroundColor:
                            'rgba(123,30,30,.10)',

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

    fetch('/api/analytics/hourly-sales')
        .then(response => response.json())
        .then(data => {

            new Chart(hourlyCanvas, {

                type: 'bar',

                data: {

                    labels: data.labels,

                    datasets: [{

                        label: 'Sales',

                        data: data.sales,

                        backgroundColor: '#2D6E36',
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

        })
        .catch(error => {
            console.error(error);
        });

}

const dayCanvas =
    document.getElementById('dailySalesChart');

if (dayCanvas) {

    fetch('/api/analytics/daily-sales')
        .then(response => response.json())
        .then(data => {

            new Chart(dayCanvas, {

                type: 'bar',

                data: {

                    labels: data.labels,

                    datasets: [{
                        label: 'Sales',

                        data: data.sales,

                        backgroundColor: '#BE2D2D',
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

        })
        .catch(error => {
            console.error(error);
        });

}

fetch('/api/analytics/branch-peak-summary')
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
        <td>${branch.peakHour}</td>
        <td>${branch.peakDay}</td>
        <td>₱${Number(branch.sales).toLocaleString()}</td>
        <td>${status}</td>
    </tr>
`;

        });

    })
    .catch(error => {
        console.error(error);
    });