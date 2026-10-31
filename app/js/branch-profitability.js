console.log("Branch Profitability Loaded");

fetch('/api/analytics/branch-profitability')
    .then(response => response.json())
    .then(data => {

        document.getElementById('highest').innerText =
            data.highest;

        document.getElementById('lowest').innerText =
            data.lowest;

        document.getElementById('averageMargin').innerText =
            data.averageMargin + '%';

        document.getElementById('branches').innerText =
            data.activeBranches;

        createCharts(data);

    });

function createCharts(data) {

    if (!data.branches || data.branches.length === 0) {

        document.getElementById('branchRevenueChart')
            .parentElement.innerHTML =
            `
            <h2>Branch Revenue Comparison</h2>
            <p style="padding:20px;color:#777;">
                No branch revenue data available.
            </p>
            `;

        document.getElementById('marginChart')
            .parentElement.innerHTML =
            `
            <h2>Profit Margin Ranking</h2>
            <p style="padding:20px;color:#777;">
                No profit margin data available.
            </p>
            `;

        return;
    }

    new Chart(
        document.getElementById('branchRevenueChart'),
        {
            type: 'bar',

            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,

                plugins: {
                    legend: {
                        display: false
                    }
                }
            },

            data: {
                labels: data.branches.map(
                    branch => branch.branch_name
                ),

                datasets: [{
                    label: 'Revenue',

                    data: data.branches.map(
                        branch => branch.revenue
                    ),

                    backgroundColor: '#2c9f60'
                }]
            }
        }
    );

    new Chart(
        document.getElementById('marginChart'),
        {
            type: 'bar',

            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,

                plugins: {
                    legend: {
                        display: false
                    }
                }
            },

            data: {
                labels: data.branches.map(
                    branch => branch.branch_name
                ),

                datasets: [{
                    label: 'Profit Margin %',

                    data: data.branches.map(
                        branch => 100
                    ),

                    backgroundColor: '#133d2a'
                }]
            }
        }
    );
}

fetch('/api/analytics/branch-performance')
    .then(response => response.json())
    .then(data => {

        const tbody =
            document.getElementById(
                'branchPerformanceBody'
            );

        if (!tbody) return;

        tbody.innerHTML = '';

        data.forEach(branch => {

            tbody.innerHTML += `
                <tr>
                    <td>${branch.branch}</td>
                    <td>₱${branch.revenue}</td>
                    <td>₱${branch.expenses}</td>
                    <td>${branch.margin}%</td>
                    <td>#${branch.rank}</td>
                </tr>
            `;

        });

    });