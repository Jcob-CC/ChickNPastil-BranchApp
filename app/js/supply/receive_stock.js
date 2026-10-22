document.addEventListener('DOMContentLoaded', () => {
    const state = { requests: [], activeRequestId: null, staffName: '' };
    const tableBody = document.getElementById('requestsTableBody');
    const message = document.getElementById('requestMessage');
    const viewModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('viewRequestModal'));
    const cancelModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('cancelRequestModal'));
    const receiveModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('receiveDeliveryModal'));

    const statusLabels = {
        pending: 'Pending',
        preparing: 'Preparing',
        in_transit: 'In transit',
        received: 'Received',
        rejected: 'Rejected',
        cancelled: 'Cancelled',
    };

    const formatQuantity = (value) => Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
    const formatDate = (value) => new Date(value.replace(' ', 'T')).toLocaleString();
    const getStatusLabel = (status) => statusLabels[status] || status;

    const sendRequest = async (url, options = {}) => {
        const response = await fetch(url, {
            ...options,
            headers: { 'Content-Type': 'application/json', ...options.headers },
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'The request could not be completed.');
        return result;
    };

    const showMessage = (text, type = 'success') => {
        message.textContent = text;
        message.className = `alert alert-${type}`;
    };

    const appendCell = (row, text, className = '') => {
        const cell = document.createElement('td');
        cell.textContent = text;
        if (className) cell.className = className;
        row.appendChild(cell);
        return cell;
    };

    const showEmptyRow = (text) => {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 5;
        cell.className = 'text-center text-secondary py-4';
        cell.textContent = text;
        row.appendChild(cell);
        tableBody.appendChild(row);
    };

    const createActionButton = (label, action, className, icon) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `btn btn-sm ${className}`;
        button.dataset.action = action;
        const iconElement = document.createElement('i');
        iconElement.className = `bi ${icon} me-1`;
        iconElement.setAttribute('aria-hidden', 'true');
        button.append(iconElement, document.createTextNode(label));
        return button;
    };

    const renderRequests = () => {
        tableBody.replaceChildren();
        const requestCount = state.requests.length;
        const statusCounts = state.requests.reduce((counts, request) => {
            counts[request.status] = (counts[request.status] || 0) + 1;
            return counts;
        }, {});
        Object.entries({
            pending: 'pendingRequestCount',
            preparing: 'preparingRequestCount',
            in_transit: 'inTransitRequestCount',
            received: 'receivedRequestCount',
            rejected: 'rejectedRequestCount',
            cancelled: 'cancelledRequestCount',
        }).forEach(([status, elementId]) => {
            document.getElementById(elementId).textContent = statusCounts[status] || 0;
        });
        document.getElementById('requestCount').textContent =
            `${requestCount} ${requestCount === 1 ? 'request' : 'requests'}`;
        document.getElementById('showingRequests').textContent = `Showing ${requestCount} requests`;

        if (!requestCount) {
            showEmptyRow('You have not submitted any stock requests yet.');
            return;
        }

        state.requests.forEach((request) => {
            const row = document.createElement('tr');
            row.dataset.requestId = request.id;
            const idCell = document.createElement('th');
            idCell.scope = 'row';
            idCell.className = 'ps-3';
            idCell.textContent = `REQ-${request.id}`;
            row.appendChild(idCell);
            appendCell(row, formatDate(request.dateAndTime), 'text-nowrap');
            const totalQuantity = request.items.reduce((total, item) => total + Number(item.quantity), 0);
            appendCell(row, `${request.items.length} ${request.items.length === 1 ? 'item' : 'items'} · ${formatQuantity(totalQuantity)} units`);

            const statusCell = appendCell(row, '');
            const badgeClasses = {
                pending: 'bg-secondary-subtle text-secondary-emphasis',
                preparing: 'bg-warning-subtle text-warning-emphasis',
                in_transit: 'bg-info-subtle text-info-emphasis',
                received: 'bg-success-subtle text-success-emphasis',
                rejected: 'bg-danger-subtle text-danger-emphasis',
                cancelled: 'bg-secondary-subtle text-secondary-emphasis',
            };
            const badge = document.createElement('span');
            badge.className = `badge ${badgeClasses[request.status] || badgeClasses.pending}`;
            badge.textContent = getStatusLabel(request.status);
            statusCell.appendChild(badge);

            const actions = appendCell(row, '', 'text-end pe-3 text-nowrap');
            const viewButton = createActionButton('View', 'view', 'btn-outline-secondary me-1', 'bi-eye');
            viewButton.dataset.requestId = request.id;
            actions.appendChild(viewButton);
            if (request.status === 'pending') {
                const cancelButton = createActionButton('Cancel', 'cancel', 'btn-outline-danger', 'bi-x-circle');
                cancelButton.dataset.requestId = request.id;
                actions.appendChild(cancelButton);
            }
            if (request.status === 'in_transit') {
                const receiveButton = createActionButton('Receive delivery', 'receive', 'btn-success', 'bi-box-arrow-in-down');
                receiveButton.dataset.requestId = request.id;
                actions.appendChild(receiveButton);
            }
            tableBody.appendChild(row);
        });
    };

    const getActiveRequest = () => state.requests.find((request) => request.id === state.activeRequestId);

    const showRequestDetails = (request) => {
        document.getElementById('viewRequestSubtitle').textContent =
            `REQ-${request.id} · ${getStatusLabel(request.status)}`;
        document.getElementById('viewRequestDate').textContent = formatDate(request.dateAndTime);
        document.getElementById('viewRequestNote').textContent = request.note || 'No note provided.';
        const rows = document.getElementById('viewRequestItems');
        rows.replaceChildren();
        request.items.forEach((item) => {
            const row = document.createElement('tr');
            const name = document.createElement('th');
            name.scope = 'row';
            name.textContent = item.name;
            row.append(name);
            appendCell(row, item.unitType);
            appendCell(row, formatQuantity(item.quantity), 'text-end');
            rows.appendChild(row);
        });
        viewModal.show();
    };

    const showReceiveForm = (request) => {
        document.getElementById('receiveDeliverySubtitle').textContent = `REQ-${request.id}`;
        document.getElementById('receivingStaff').value = state.staffName;
        document.getElementById('receivedAt').value = new Date().toLocaleString();
        document.getElementById('receivingNotes').value = '';
        document.getElementById('receiveError').textContent = '';
        const rows = document.getElementById('receiveDeliveryItems');
        rows.replaceChildren();
        request.items.forEach((item) => {
            const row = document.createElement('tr');
            row.dataset.requestItemId = item.requestItemId;
            const name = document.createElement('th');
            name.scope = 'row';
            name.append(document.createTextNode(item.name));
            const unit = document.createElement('small');
            unit.className = 'text-secondary fw-normal ms-1';
            unit.textContent = item.unitType;
            name.appendChild(unit);
            row.appendChild(name);
            appendCell(row, formatQuantity(item.quantity), 'text-end');
            ['received', 'discrepancy'].forEach((quantityType) => {
                const cell = appendCell(row, '');
                const input = document.createElement('input');
                input.className = 'form-control form-control-sm';
                input.type = 'number';
                input.min = '0';
                input.max = item.quantity;
                input.step = '0.01';
                input.required = true;
                input.value = quantityType === 'received' ? item.quantity : '0';
                input.dataset.quantityType = quantityType;
                input.setAttribute(
                    'aria-label',
                    `${item.name} ${quantityType === 'received' ? 'accepted' : 'missing or damaged'} quantity`,
                );
                cell.appendChild(input);
            });
            rows.appendChild(row);
        });
        receiveModal.show();
    };

    document.getElementById('receiveDeliveryItems').addEventListener('input', (event) => {
        const changedInput = event.target.closest('[data-quantity-type]');
        if (!changedInput || changedInput.value === '') return;
        const row = changedInput.closest('tr');
        const request = getActiveRequest();
        const item = request.items.find((requestItem) =>
            requestItem.requestItemId === Number(row.dataset.requestItemId)
        );
        const acceptedInput = row.querySelector('[data-quantity-type="received"]');
        const discrepancyInput = row.querySelector('[data-quantity-type="discrepancy"]');
        const changedValue = Math.min(Math.max(Number(changedInput.value), 0), Number(item.quantity));
        changedInput.value = changedValue;

        if (changedInput.dataset.quantityType === 'received') {
            discrepancyInput.value = Number(item.quantity) - changedValue;
        } else {
            acceptedInput.value = Number(item.quantity) - changedValue;
        }
    });

    const loadRequests = async () => {
        const data = await sendRequest('/supply/receive_stock/data');
        state.requests = data.requests;
        state.staffName = data.staffName;
        document.getElementById('branchName').textContent = `${data.branchName} · requests and deliveries`;
        renderRequests();
    };

    tableBody.addEventListener('click', (event) => {
        const button = event.target.closest('[data-action]');
        if (!button) return;
        const requestId = Number(button.dataset.requestId);
        const request = state.requests.find((item) => item.id === requestId);
        if (!request) return;
        state.activeRequestId = requestId;
        if (button.dataset.action === 'view') showRequestDetails(request);
        if (button.dataset.action === 'cancel') {
            document.getElementById('cancelRequestSubtitle').textContent = `REQ-${request.id}`;
            cancelModal.show();
        }
        if (button.dataset.action === 'receive') showReceiveForm(request);
    });

    document.getElementById('confirmCancelRequest').addEventListener('click', async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        message.classList.add('d-none');
        try {
            await sendRequest(`/supply/receive_stock/${state.activeRequestId}/cancel`, { method: 'PUT' });
            cancelModal.hide();
            await loadRequests();
            showMessage('Request cancelled.');
        } catch (error) {
            showMessage(error.message, 'danger');
        } finally {
            button.disabled = false;
        }
    });

    document.getElementById('receiveDeliveryForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = document.getElementById('saveReceipt');
        const error = document.getElementById('receiveError');
        const items = Array.from(document.querySelectorAll('#receiveDeliveryItems tr')).map((row) => {
            const values = Object.fromEntries(
                Array.from(row.querySelectorAll('[data-quantity-type]'))
                    .map((input) => [input.dataset.quantityType, Number(input.value)]),
            );
            return {
                requestItemId: Number(row.dataset.requestItemId),
                received: values.received,
                missing: values.discrepancy,
                damaged: 0,
            };
        });
        const request = getActiveRequest();
        const hasInvalidTotals = items.some((item, index) => {
            const requested = Number(request.items[index].quantity);
            return Math.abs(item.received + item.missing - requested) > 0.0000001;
        });
        if (hasInvalidTotals) {
            error.textContent = 'Accepted and missing/damaged quantities must equal the requested quantity for each item.';
            return;
        }

        button.disabled = true;
        error.textContent = '';
        message.classList.add('d-none');
        try {
            await sendRequest(`/supply/receive_stock/${state.activeRequestId}/receive`, {
                method: 'POST',
                body: JSON.stringify({ items, note: document.getElementById('receivingNotes').value }),
            });
            receiveModal.hide();
            await loadRequests();
            showMessage('Delivery received and branch inventory updated.');
        } catch (requestError) {
            error.textContent = requestError.message;
        } finally {
            button.disabled = false;
        }
    });

    loadRequests().catch((error) => {
        showMessage(error.message, 'danger');
        tableBody.replaceChildren();
        showEmptyRow('Unable to load branch requests.');
    });
});
