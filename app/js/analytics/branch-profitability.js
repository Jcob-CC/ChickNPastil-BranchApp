function loadBranchProfitability() {

    const date =
        document.getElementById('dateFilter')?.value || '';

    const branch =
        document.getElementById('branchFilter')?.value || 'all';

    const query = new URLSearchParams({
        date,
        branch
    });

    fetch(`/api/analytics/branch-profitability?${query}`)
        .then(response => response.json())
        .then(data => {

            document.getElementById('highest').innerText =
                data.highest;

            document.getElementById('lowest').innerText =
                data.lowest;

            document.getElementById('averageMargin').innerText =
                data.averageMargin;

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

            const marginContainer =
                document.querySelectorAll(
                    '.chart-box.profitability-chart'
                )[1];

            marginContainer.innerHTML = `
                <h2>Profit Margin Ranking</h2>
                <p style="padding:20px;color:#777;">
                No expense data available.
            </p>
`;

            return;
        }

        const container =
            document.querySelector(
                '.chart-box.profitability-chart'
            );

        const maxRevenue = Math.max(
            ...data.branches.map(branch => branch.revenue),
            0
        );

        container.innerHTML = `
    <h2>Branch Revenue Comparison</h2>

    <div class="sales-bars">
        ${data.branches.map(branch => `
            <div class="sales-row">

                <span class="sales-label">
                    ${branch.branch_name}
                </span>

                <div class="sales-track">
                    <div
                        class="sales-fill"
                        style="
                            width:${maxRevenue > 0
                ? (branch.revenue / maxRevenue) * 100
                : 0
            }%;
                        ">
                    </div>
                </div>

                <span class="sales-value">
                    ₱${Number(branch.revenue).toLocaleString()}
                </span>

            </div>
        `).join('')}
    </div>
`;

        const marginContainer =
            document.querySelectorAll(
                '.chart-box.profitability-chart'
            )[1];

        marginContainer.innerHTML = `
            <h2>Profit Margin Ranking</h2>
            <p style="padding:20px;color:#777;">
            No expense data available.
            </p>
`;
    }

    fetch(`/api/analytics/branch-performance?${query}`)
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

                <td>
                    ₱${Number(branch.revenue).toLocaleString()}
                </td>

                <td>
                    ${branch.expenses === null
                        ? 'N/A'
                        : '₱' + Number(branch.expenses).toLocaleString()
                    }
                </td>

                <td>
                    ₱${Number(branch.profit).toLocaleString()}
                </td>

                <td>
                    ${branch.margin === null
                        ? 'N/A'
                        : Number(branch.margin).toFixed(1) + '%'
                    }
                </td>

                <td>#${branch.rank}</td>
            </tr>
        `;

            });

        });
}

document
    .getElementById('dateFilter')
    ?.addEventListener('change', loadBranchProfitability);

document
    .getElementById('branchFilter')
    ?.addEventListener('change', loadBranchProfitability);

loadBranchProfitability();