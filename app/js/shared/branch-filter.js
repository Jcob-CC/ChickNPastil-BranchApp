window.loadBranchFilter = async function () {
    const branchFilter = document.getElementById('branchFilter');

    if (!branchFilter) return;

    try {
        const response =
            await fetch('/api/analytics/branches');

        const branches =
            await response.json();

        branchFilter.innerHTML =
            '<option value="all">All Branches</option>';

        branches.forEach(branch => {
            branchFilter.innerHTML += `
                <option value="${branch.location_name}">
                    ${branch.location_name}
                </option>
            `;
        });

    } catch (error) {
        console.error(
            'Branch filter error:',
            error
        );
    }
}