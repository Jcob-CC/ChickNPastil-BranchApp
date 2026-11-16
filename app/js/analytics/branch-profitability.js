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
                `${data.averageMargin}%`;

            document.getElementById('branches').innerText =
                data.activeBranches;

        });

    fetch(`/api/analytics/branch-performance?${query}`)
        .then(response => response.json())
        .then(data => {

            window.branchPerformanceData = data;

            createCharts({
                branches: data.map(branch => ({
                    branch_name: branch.branch,
                    revenue: branch.revenue
                }))
            });

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
                        : '₱' +
                        Number(branch.expenses)
                            .toLocaleString()
                    }
                        </td>

                        <td>
                            ₱${Number(branch.profit).toLocaleString()}
                        </td>

                        <td>
                            ${branch.margin === null
                        ? 'N/A'
                        : Number(branch.margin)
                            .toFixed(1) + '%'
                    }
                        </td>

                        <td>#${branch.rank}</td>
                    </tr>
                `;
            });

        });

    function createCharts(data) {

        if (!data.branches || data.branches.length === 0) {

            document.querySelector(
                '.chart-box.profitability-chart'
            ).innerHTML = `
                <h2>Branch Revenue Comparison</h2>
                <p style="padding:20px;color:#777;">
                    No branch revenue data available.
                </p>
            `;

            document.querySelectorAll(
                '.chart-box.profitability-chart'
            )[1].innerHTML = `
                <h2>Profit Margin Ranking</h2>
                <p style="padding:20px;color:#777;">
                    No data available.
                </p>
            `;

            return;
        }

        const revenueContainer =
            document.querySelectorAll(
                '.chart-box.profitability-chart'
            )[0];

        const maxRevenue = Math.max(
            ...data.branches.map(
                branch => Number(branch.revenue || 0)
            ),
            1
        );

        revenueContainer.innerHTML = `
            <h2>Branch Revenue Comparison</h2>

            <div class="sales-bars">
                ${data.branches.map(branch => {

            const width =
                (Number(branch.revenue || 0) /
                    maxRevenue) * 100;

            return `
                        <div class="sales-row">

                            <span class="sales-label">
                            ${branch.branch_name}
                            </span>

                            <div class="sales-track">
                                <div
                                    class="sales-fill"
                                    style="width:${width}%;">
                                </div>
                            </div>

                            <span class="sales-value">
                                ₱${Number(branch.revenue)
                    .toLocaleString()}
                            </span>

                        </div>
                    `;
        }).join('')}
            </div>
        `;

        const marginContainer =
            document.querySelectorAll(
                '.chart-box.profitability-chart'
            )[1];

        if (
            !window.branchPerformanceData ||
            !window.branchPerformanceData.length
        ) {
            return;
        }

        const maxMargin = Math.max(
            ...window.branchPerformanceData.map(
                branch => Number(branch.margin || 0)
            ),
            1
        );

        marginContainer.innerHTML = `
            <h2>Profit Margin Ranking</h2>

            <div class="sales-bars">
            ${[...window.branchPerformanceData]
                .sort((a, b) =>
                    Number(b.margin || 0) -
                    Number(a.margin || 0)
                )
                .map(branch => {

                    const width =
                        (Number(branch.margin || 0) /
                            maxMargin) * 100;

                    return `
                            <div class="sales-row">

                                <span class="sales-label">
                                ${branch.branch}
                                </span>

                                <div class="sales-track">
                                    <div
                                        class="sales-fill"
                                        style="
                                            width:${width}%;
                                            background:#BE2D2D;
                                        ">
                                    </div>
                                </div>

                                <span class="sales-value">
                                    ${Number(branch.margin || 0)
                            .toFixed(1)}%
                                </span>

                            </div>
                        `;
                })
                .join('')}
            </div>
        `;
    }
}

document
    .getElementById('dateFilter')
    ?.addEventListener(
        'change',
        loadBranchProfitability
    );

document
    .getElementById('branchFilter')
    ?.addEventListener(
        'change',
        loadBranchProfitability
    );

(async () => {
    await loadBranchFilter();
    loadBranchProfitability();
})();