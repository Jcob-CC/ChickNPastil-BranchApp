fetch('/api/analytics/wastage-insights')
    .then(response => response.json())
    .then(data => {

        document.getElementById('totalCost').innerText =
            '₱' + Number(data.totalCost).toLocaleString();

        const highestBranch =
            [...data.wastages].sort(
                (a, b) =>
                    b.estimated_cost -
                    a.estimated_cost
            )[0];

        document.getElementById('topBranch').innerText =
            highestBranch?.branch_name || 'N/A';

        document.getElementById('topBranchCost').innerText =
            '₱' +
            Number(
                highestBranch?.estimated_cost || 0
            ).toLocaleString();

        if (!data.wastages || data.wastages.length === 0) {
            return;
        }

        document.getElementById('incidents').innerText =
            data.incidents;

        document.getElementById('profitImpact').innerText =
            '₱' +
            Number(data.totalCost).toLocaleString();

        const insightsBody =
            document.getElementById(
                'branchInsightsBody'
            );

        if (insightsBody) {

            insightsBody.innerHTML = '';

            const branchSummary = {};

            data.wastages.forEach(item => {

                const branch =
                    item.branch_name || 'Unknown';

                const reason =
                    item.reason || 'Unspecified expense';

                if (!branchSummary[branch]) {

                    branchSummary[branch] = {
                        totalCost: 0,
                        reasons: []
                    };

                }

                branchSummary[branch].totalCost +=
                    Number(item.estimated_cost || 0);

                branchSummary[branch].reasons.push(reason);

            });

            Object.entries(branchSummary)
                .sort(
                    (a, b) =>
                        b[1].totalCost -
                        a[1].totalCost
                )
                .forEach(([branch, stats]) => {

                    const issues =
                        [...new Set(stats.reasons)]
                            .join(', ');

                    let recommendation =
                        'Review recurring operational expenses and strengthen loss prevention controls';

                    if (
                        issues
                            .toLowerCase()
                            .includes('overproduction')
                    ) {

                        recommendation =
                            'Reduce production quantities and improve demand forecasting';

                    } else if (
                        issues
                            .toLowerCase()
                            .includes('spoilage')
                    ) {

                        recommendation =
                            'Improve storage monitoring and cold-chain procedures';

                    } else if (
                        issues
                            .toLowerCase()
                            .includes('expiry')
                    ) {

                        recommendation =
                            'Review inventory turnover and replenishment schedules';

                    }

                    insightsBody.innerHTML += `
                <tr>
                    <td>${branch}</td>
                    <td>₱${stats.totalCost.toLocaleString()}</td>
                    <td>₱${stats.totalCost.toLocaleString()}</td>
                    <td>${issues}</td>
                    <td>${recommendation}</td>
                </tr>
            `;
                });

        }

        const branchBars =
            document.getElementById(
                'wastageBranchBars'
            );

        if (branchBars) {

            branchBars.innerHTML = '';

            const branchTotals = {};

            data.wastages.forEach(item => {

                const branch =
                    item.branch_name || 'Unknown';

                if (!branchTotals[branch]) {
                    branchTotals[branch] = 0;
                }

                branchTotals[branch] +=
                    Number(item.estimated_cost || 0);

            });

            const maxValue = Math.max(
                ...Object.values(branchTotals),
                1
            );

            Object.entries(branchTotals)
                .sort((a, b) => b[1] - a[1])
                .forEach(([branch, total]) => {

                    const width =
                        (total / maxValue) * 100;

                    branchBars.innerHTML += `
                <div class="bar-row">

                    <span class="bar-label">
                        ${branch}
                    </span>

                    <div class="bar-track">

                        <div
                            class="bar-fill"
                            style="
                                width:${width}%;
                                background:#2D6E36;
                            ">
                        </div>

                    </div>

                    <span class="bar-value">
                        ₱${Number(total).toLocaleString()}
                    </span>

                </div>
            `;
                });

        }

        const profitBars =
            document.getElementById(
                'profitImpactBars'
            );

        if (profitBars) {

            profitBars.innerHTML = '';

            const branchTotals = {};

            data.wastages.forEach(item => {

                const branch =
                    item.branch_name || 'Unknown';

                if (!branchTotals[branch]) {
                    branchTotals[branch] = 0;
                }

                branchTotals[branch] +=
                    Number(item.estimated_cost || 0);

            });

            const maxValue = Math.max(
                ...Object.values(branchTotals),
                1
            );

            Object.entries(branchTotals)
                .sort((a, b) => b[1] - a[1])
                .forEach(([branch, total]) => {

                    const width =
                        (total / maxValue) * 100;

                    profitBars.innerHTML += `
                <div class="bar-row">

                    <span class="bar-label">
                        ${branch}
                    </span>

                    <div class="bar-track">

                        <div
                            class="bar-fill"
                            style="
                                width:${width}%;
                                background:#BE2D2D;
                            ">
                        </div>

                    </div>

                    <span class="bar-value">
                        ₱${Number(total).toLocaleString()}
                    </span>

                </div>
            `;
                });

        }

        const trendChart =
            document.getElementById(
                'wastageTrendChart'
            );

        if (trendChart) {

            const trendData =
                [...data.wastages].sort(
                    (a, b) =>
                        new Date(b.date_recorded) -
                        new Date(a.date_recorded)
                );

            new Chart(trendChart, {

                type: 'line',

                data: {

                    labels:
                        trendData.map(
                            (item, index) =>
                                `Week ${index + 1}`
                        ),


                    datasets: [{

                        label: 'Wastage Cost',

                        data:
                            trendData.map(
                                item =>
                                    item.estimated_cost
                            ),

                        borderColor: '#0b4b36',

                        backgroundColor:
                            'rgba(11,75,54,0.15)',

                        borderWidth: 4,

                        fill: true,

                        tension: 0.4,

                        pointRadius: 6,

                        pointBackgroundColor:
                            '#0b4b36'

                    }]

                },

                options: {

                    responsive: true,

                    plugins: {

                        legend: {
                            display: false
                        }

                    },

                    scales: {

                        y: {
                            beginAtZero: true
                        }

                    }

                }

            });

        }

    })
    .catch(error => {
        console.error(error);
    });

async function loadStrategicInsights() {

    try {

        const response =
            await fetch(
                '/api/analytics/strategic-insights'
            );

        const insights =
            await response.json();

        const container =
            document.getElementById(
                'strategicInsightsContainer'
            );

        if (!container) return;

        container.innerHTML = '';

        insights.forEach(insight => {

            container.innerHTML += `
                <div class="strategic-insight-item">
                    <span class="insight-dot"></span>
                    <strong>${insight.branch}:</strong>
                    ${insight.recommendation}
                </div>
            `;

        });

    } catch (error) {

        console.error(
            'Strategic Insights Error',
            error
        );

    }

}

loadStrategicInsights();

const refreshButton =
    document.getElementById(
        'refreshInsights'
    );

if (refreshButton) {

    refreshButton.addEventListener(
        'click',
        async () => {

            refreshButton.disabled = true;

            refreshButton.innerHTML = `
                <i class="bi bi-arrow-repeat"></i>
                Refreshing...
            `;

            try {

                await loadStrategicInsights();

            } finally {

                setTimeout(() => {

                    refreshButton.disabled = false;

                    refreshButton.innerHTML = `
                        <i class="bi bi-arrow-clockwise"></i>
                        Regenerate Insights
                    `;

                }, 1000);

            }

        }
    );

}