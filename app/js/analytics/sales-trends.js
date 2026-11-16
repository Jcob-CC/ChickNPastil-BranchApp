function loadSalesTrends() {

    const date =
        document.getElementById('dateFilter')?.value || '';

    const branch =
        document.getElementById('branchFilter')?.value || 'all';

    const query =
        new URLSearchParams({
            date,
            branch
        });

    fetch(`/api/analytics/sales-insights?${query}`)
        .then(response => response.json())
        .then(data => {

            if (
                data.peakSalesHour &&
                data.peakSalesHour !== 'N/A'
            ) {

                const [hour] =
                    data.peakSalesHour.split(':');

                document.getElementById('peakHour').innerText =
                    new Date(
                        `2000-01-01 ${hour}:00:00`
                    ).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true
                    });

            } else {

                document.getElementById('peakHour').innerText =
                    'N/A';

            }

            document.getElementById('peakDay').innerText =
                data.peakSalesDay &&
                data.peakSalesDay !== 'N/A'
                    ? new Date(
                        data.peakSalesDay
                    ).toLocaleDateString('en-US', {
                        weekday: 'long'
                    })
                    : 'N/A';

            document.getElementById('topBranch').innerText =
                data.highestSalesBranch || 'N/A';

            document.getElementById('bestPeriod').innerText =
                data.bestSalesPeriod || 'N/A';

            document.getElementById('topBranchSales').innerText =
                '₱' +
                Number(
                    data.highestSalesRevenue || 0
                ).toLocaleString() +
                ' (7d)';

            document.getElementById('peakHourNote').innerText =
                'Based on completed orders';

        })
        .catch(console.error);

    fetch(`/api/analytics/sales-trends?${query}`)
        .then(response => response.json())
        .then(data => {

            const trendCanvas =
                document.getElementById('salesTrendChart');

            if (!trendCanvas) return;

            if (window.salesTrendChartInstance) {
                window.salesTrendChartInstance.destroy();
            }

            window.salesTrendChartInstance =
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

        })
        .catch(console.error);

    const salesHourBars =
        document.getElementById('salesHourBars');

    if (salesHourBars) {

        fetch(`/api/analytics/hourly-sales?${query}`)
            .then(response => response.json())
            .then(data => {

                const topHours =
                    data.labels.map((hour, index) => ({
                        hour,
                        sales: data.sales[index]
                    }))
                        .sort((a, b) => b.sales - a.sales)
                        .slice(0, 7);

                const maxSales =
                    Math.max(
                        ...topHours.map(item => item.sales),
                        0
                    );

                salesHourBars.innerHTML =
                    topHours.map(item => {

                        const width =
                            maxSales > 0
                                ? (item.sales / maxSales) * 100
                                : 0;

                        return `
                            <div class="bar-row">
                                <div class="bar-label">
                                    ${new Date(`2000-01-01 ${item.hour}:00`)
                                        .toLocaleTimeString('en-US', {
                                            hour: 'numeric',
                                            minute: '2-digit',
                                            hour12: true
                                        })}
                                </div>

                                <div class="bar-track">
                                    <div
                                        class="bar-fill"
                                        style="
                                            width:${width}%;
                                            background:#2D6E36;
                                        ">
                                    </div>
                                </div>

                                <div class="bar-value">
                                    ₱${Number(item.sales).toLocaleString()}
                                </div>
                            </div>
                        `;
                    }).join('');

            })
            .catch(console.error);

    }

    const salesDayBars =
        document.getElementById('salesDayBars');

    if (salesDayBars) {

        fetch(`/api/analytics/daily-sales?${query}`)
            .then(response => response.json())
            .then(data => {

                const allDays = [
                    'Mon',
                    'Tue',
                    'Wed',
                    'Thu',
                    'Fri',
                    'Sat',
                    'Sun'
                ];

                const daySales = {};

                data.labels.forEach((day, index) => {
                    daySales[day] = data.sales[index];
                });

                const completeData =
                    allDays.map(day => ({
                        day,
                        sales: daySales[day] || 0
                    }));

                const maxSales =
                    Math.max(
                        ...completeData.map(item => item.sales),
                        0
                    );

                salesDayBars.innerHTML =
                    completeData.map(item => {

                        const width =
                            maxSales > 0
                                ? (item.sales / maxSales) * 100
                                : 0;

                        return `
                            <div class="bar-row">
                                <div class="bar-label">
                                    ${item.day}
                                </div>

                                <div class="bar-track">
                                    <div
                                        class="bar-fill"
                                        style="
                                            width:${width}%;
                                            background:#BE2D2D;
                                        ">
                                    </div>
                                </div>

                                <div class="bar-value">
                                    ₱${Number(item.sales).toLocaleString()}
                                </div>
                            </div>
                        `;
                    }).join('');

            })
            .catch(console.error);

    }

    fetch(`/api/analytics/branch-peak-summary?${query}`)
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
        .catch(console.error);

}

document
    .getElementById('dateFilter')
    ?.addEventListener('change', loadSalesTrends);

document
    .getElementById('branchFilter')
    ?.addEventListener('change', loadSalesTrends);

(async () => {
    await loadBranchFilter();
    loadSalesTrends();
})();