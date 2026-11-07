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
            highestBranch.branch_name;

        document.getElementById('topBranchCost').innerText =
            '₱' +
            Number(
                highestBranch.estimated_cost
            ).toLocaleString();

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

            data.wastages.forEach(item => {

                let recommendation =
                    'Review branch wastage controls';

                if (
                    item.reason
                        .toLowerCase()
                        .includes('overproduction')
                ) {

                    recommendation =
                        'Reduce weekday lunch rice batch by 10%';

                } else if (
                    item.reason
                        .toLowerCase()
                        .includes('spoilage')
                ) {

                    recommendation =
                        'Add cold-chain check at handover';

                } else if (
                    item.reason
                        .toLowerCase()
                        .includes('expiry')
                ) {

                    recommendation =
                        'Bundle promo before expiration window';

                } else if (
                    item.reason
                        .toLowerCase()
                        .includes('surplus')
                ) {

                    recommendation =
                        'Adjust afternoon production forecast';
                }

                insightsBody.innerHTML += `
                    <tr>
                        <td>${item.branch_name}</td>
                        <td>₱${Number(item.estimated_cost).toLocaleString()}</td>
                        <td>₱${Number(item.estimated_cost).toLocaleString()}</td>
                        <td>${item.reason}</td>
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

            const maxValue = Math.max(
                ...data.wastages.map(
                    item =>
                        item.estimated_cost
                )
            );

            data.wastages.forEach(item => {

                const width =
                    (item.estimated_cost /
                        maxValue) * 100;

                branchBars.innerHTML += `
                    <div class="bar-row">

                        <span class="bar-label">
                            ${item.branch_name}
                        </span>

                        <div class="bar-track">

                            <div
                                class="bar-fill"
                                style="
                                    width:${width}%;
                                    background:#d94b3d;
                                ">
                            </div>

                        </div>

                        <span class="bar-value">
                            ₱${Number(
                    item.estimated_cost
                ).toLocaleString()}
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

            const maxValue = Math.max(
                ...data.wastages.map(
                    item =>
                        item.estimated_cost
                )
            );

            data.wastages.forEach(item => {

                const width =
                    (item.estimated_cost /
                        maxValue) * 100;

                profitBars.innerHTML += `
                    <div class="bar-row">

                        <span class="bar-label">
                            ${item.branch_name}
                        </span>

                        <div class="bar-track">

                            <div
                                class="bar-fill"
                                style="
                                    width:${width}%;
                                    background:#d58a1f;
                                ">
                            </div>

                        </div>

                        <span class="bar-value">
                            ₱${Number(
                    item.estimated_cost
                ).toLocaleString()}
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

                            min: 1400,
                            max: 2400,

                            ticks: {
                                stepSize: 200
                            }

                        }

                    }

                }

            });

        }

    })
    .catch(error => {
        console.error(error);
    });