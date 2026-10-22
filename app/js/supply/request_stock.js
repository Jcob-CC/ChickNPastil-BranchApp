document.addEventListener('DOMContentLoaded', () => {
    const state = { items: [], requested: new Map() };
    const requestForm = document.getElementById('requisitionForm');
    const requestRows = document.getElementById('requestedItems');
    const inventoryRows = document.getElementById('inventoryItems');
    const availableRows = document.getElementById('availableItems');
    const message = document.getElementById('requestMessage');
    const inventoryMessage = document.getElementById('inventoryMessage');
    const requestButton = document.getElementById('submitRequest');
    const inventoryButton = document.getElementById('saveInventory');
    const inventoryModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('inventoryModal'));
    const receiptModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('requestReceiptModal'));

    const formatQuantity = (value) => Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
    const isLowStock = (item) => Number(item.quantity) <= Number(item.low_quantity_threshold);
    const getRestockQuantity = (item) =>
        Math.max(Number(item.restock_target_quantity) - Number(item.quantity), 0);

    const showMessage = (text, type = 'success') => {
        message.className = `alert alert-${type}`;
        message.textContent = text;
    };

    const sendRequest = async (url, options = {}) => {
        const response = await fetch(url, {
            ...options,
            headers: { 'Content-Type': 'application/json', ...options.headers },
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'The request could not be completed.');
        return result;
    };

    const appendCell = (row, text, className = '') => {
        const cell = document.createElement('td');
        cell.textContent = text;
        if (className) cell.className = className;
        row.appendChild(cell);
        return cell;
    };

    const addItemName = (row, item) => {
        const cell = document.createElement('th');
        cell.scope = 'row';
        cell.className = 'ps-3 fw-medium';
        cell.append(document.createTextNode(item.name));
        const unit = document.createElement('small');
        unit.className = 'd-block text-secondary fw-normal';
        unit.textContent = item.unit_type;
        cell.appendChild(unit);
        row.appendChild(cell);
    };

    const showEmptyRow = (container, colspan, text) => {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = colspan;
        cell.className = 'text-center text-secondary py-4';
        cell.textContent = text;
        row.appendChild(cell);
        container.appendChild(row);
    };

    const showRequestReceipt = (requestId, items, note) => {
        document.getElementById('receiptRequestId').textContent = `REQ-${requestId}`;
        document.getElementById('receiptSubmittedAt').textContent = new Date().toLocaleString();
        document.getElementById('receiptBranch').textContent = document.getElementById('requestLocation').value;
        document.getElementById('receiptStaff').textContent = document.getElementById('requestStaff').value;
        document.getElementById('receiptNote').textContent = note.trim() || 'No note provided.';

        const receiptRows = document.getElementById('receiptItems');
        receiptRows.replaceChildren();
        items.forEach((item) => {
            const inventoryItem = state.items.find((current) => current.id === item.inventoryItemId);
            const row = document.createElement('tr');
            const name = document.createElement('td');
            name.textContent = inventoryItem ? inventoryItem.name : 'Inventory item';
            const quantity = document.createElement('td');
            quantity.className = 'text-end';
            quantity.textContent = `${formatQuantity(item.quantity)} ${inventoryItem ? inventoryItem.unit_type : ''}`.trim();
            row.append(name, quantity);
            receiptRows.appendChild(row);
        });

        receiptModal.show();
    };

    const renderRequestedItems = () => {
        requestRows.replaceChildren();
        const requestedItems = state.items.filter((item) => state.requested.has(item.id));
        document.getElementById('itemCount').textContent =
            `${requestedItems.length} ${requestedItems.length === 1 ? 'item' : 'items'} · quantities for this request`;

        if (requestedItems.length === 0) {
            showEmptyRow(requestRows, 5, 'Add items from your branch inventory to start a requisition.');
            return;
        }

        requestedItems.forEach((item) => {
            const row = document.createElement('tr');
            row.dataset.inventoryId = item.id;
            addItemName(row, item);
            appendCell(row, `${formatQuantity(item.quantity)} ${item.unit_type}`);
            appendCell(row, `${formatQuantity(item.restock_target_quantity)} ${item.unit_type}`);

            const quantityCell = appendCell(row, '', 'pe-3');
            const quantity = document.createElement('input');
            quantity.className = 'form-control';
            quantity.type = 'number';
            quantity.min = '0';
            quantity.step = '0.01';
            quantity.value = state.requested.get(item.id);
            quantity.setAttribute('aria-label', `${item.name} request quantity`);
            quantity.addEventListener('input', () => {
                state.requested.set(item.id, quantity.value);
            });
            quantityCell.appendChild(quantity);

            const actionCell = appendCell(row, '', 'text-end pe-3');
            const removeButton = document.createElement('button');
            removeButton.className = 'btn btn-sm btn-outline-secondary';
            removeButton.type = 'button';
            removeButton.dataset.removeItem = item.id;
            removeButton.setAttribute('aria-label', `Remove ${item.name}`);
            removeButton.innerHTML = '<i class="bi bi-trash" aria-hidden="true"></i>';
            actionCell.appendChild(removeButton);
            requestRows.appendChild(row);
        });
    };

    const renderAvailableItems = () => {
        availableRows.replaceChildren();
        const available = state.items.filter((item) => !state.requested.has(item.id));
        if (available.length === 0) {
            showEmptyRow(availableRows, 4, 'All branch inventory items have been added.');
            return;
        }

        available.forEach((item) => {
            const row = document.createElement('tr');
            addItemName(row, item);
            appendCell(row, `${formatQuantity(item.quantity)} ${item.unit_type}`);
            appendCell(row, `${formatQuantity(item.restock_target_quantity)} ${item.unit_type}`);
            const actionCell = appendCell(row, '', 'text-end pe-3');
            const addButton = document.createElement('button');
            addButton.className = 'btn btn-sm btn-outline-success';
            addButton.type = 'button';
            addButton.dataset.addItem = item.id;
            addButton.textContent = 'Add';
            actionCell.appendChild(addButton);
            availableRows.appendChild(row);
        });
    };

    const renderInventory = () => {
        inventoryRows.replaceChildren();
        inventoryButton.disabled = state.items.length === 0;
        if (state.items.length === 0) {
            showEmptyRow(inventoryRows, 3, 'No inventory items are available for this branch.');
            return;
        }

        state.items.forEach((item) => {
            const row = document.createElement('tr');
            addItemName(row, item);

            const quantityCell = appendCell(row, '', '');
            const quantityInput = document.createElement('input');
            quantityInput.className = 'form-control';
            quantityInput.type = 'number';
            quantityInput.min = '0';
            quantityInput.step = '0.01';
            quantityInput.value = item.quantity;
            quantityInput.dataset.inventoryId = item.id;
            quantityInput.dataset.inventoryField = 'quantity';
            quantityInput.setAttribute('aria-label', `${item.name} current quantity`);
            quantityCell.appendChild(quantityInput);

            const targetCell = appendCell(row, '', 'pe-3');
            const targetInput = document.createElement('input');
            targetInput.className = 'form-control';
            targetInput.type = 'number';
            targetInput.min = item.low_quantity_threshold;
            targetInput.step = '0.01';
            targetInput.value = item.restock_target_quantity;
            targetInput.dataset.inventoryId = item.id;
            targetInput.dataset.inventoryField = 'target';
            targetInput.setAttribute('aria-label', `${item.name} target quantity`);
            targetCell.appendChild(targetInput);
            inventoryRows.appendChild(row);
        });
    };

    const loadInventory = async (initializePage = false) => {
        const data = await sendRequest('/supply/request_stock/data');
        state.items = data.items;
        document.getElementById('requestLocation').value = data.branchName;
        document.getElementById('requestStaff').value = data.staffName || '—';
        if (initializePage) {
            state.items.filter(isLowStock).forEach((item) => {
                state.requested.set(item.id, getRestockQuantity(item));
            });
        }
        renderRequestedItems();
        renderAvailableItems();
        renderInventory();
        if (initializePage) inventoryModal.show();
    };

    requestRows.addEventListener('click', (event) => {
        const button = event.target.closest('[data-remove-item]');
        if (!button) return;
        state.requested.delete(Number(button.dataset.removeItem));
        renderRequestedItems();
        renderAvailableItems();
    });

    availableRows.addEventListener('click', (event) => {
        const button = event.target.closest('[data-add-item]');
        if (!button) return;
        const item = state.items.find((inventoryItem) => inventoryItem.id === Number(button.dataset.addItem));
        if (!item) return;
        state.requested.set(item.id, getRestockQuantity(item));
        renderRequestedItems();
        renderAvailableItems();
    });

    requestForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        message.classList.add('d-none');
        const items = Array.from(requestRows.querySelectorAll('tr[data-inventory-id]'))
            .map((row) => ({
                inventoryItemId: Number(row.dataset.inventoryId),
                quantity: Number(row.querySelector('input').value),
            }))
            .filter((item) => item.quantity > 0);

        if (items.length === 0) {
            showMessage('Enter a request quantity greater than zero for at least one item.', 'warning');
            return;
        }

        requestButton.disabled = true;
        try {
            const note = document.getElementById('requestNote').value;
            const result = await sendRequest('/supply/request_stock', {
                method: 'POST',
                body: JSON.stringify({ items, note }),
            });
            state.requested.clear();
            document.getElementById('requestNote').value = '';
            renderRequestedItems();
            renderAvailableItems();
            showRequestReceipt(result.requestId, items, note);
        } catch (error) {
            showMessage(error.message, 'danger');
        } finally {
            requestButton.disabled = false;
        }
    });

    inventoryButton.addEventListener('click', async () => {
        inventoryMessage.className = 'alert d-none m-3 mb-0';
        inventoryMessage.textContent = '';
        const inventoryInputs = Array.from(inventoryRows.querySelectorAll('input'));
        if (!inventoryInputs.every((input) => input.reportValidity())) return;

        const items = state.items.map((item) => ({
            id: item.id,
            quantity: Number(inventoryRows.querySelector(`[data-inventory-id="${item.id}"][data-inventory-field="quantity"]`).value),
            restockTargetQuantity: Number(inventoryRows.querySelector(`[data-inventory-id="${item.id}"][data-inventory-field="target"]`).value),
        }));

        inventoryButton.disabled = true;
        try {
            await sendRequest('/supply/request_stock/confirm-inventory', {
                method: 'PUT',
                body: JSON.stringify({ items }),
            });
            const selectedItems = new Set(state.requested.keys());
            await loadInventory();
            state.requested.clear();
            state.items.filter((item) => isLowStock(item) || selectedItems.has(item.id)).forEach((item) => {
                state.requested.set(item.id, getRestockQuantity(item));
            });
            renderRequestedItems();
            renderAvailableItems();
            inventoryModal.hide();
            showMessage('Branch inventory confirmed.');
        } catch (error) {
            inventoryMessage.className = 'alert alert-danger m-3 mb-0';
            inventoryMessage.textContent = error.message;
        } finally {
            inventoryButton.disabled = false;
        }
    });

    loadInventory(true).catch((error) => {
        document.getElementById('itemCount').textContent = 'Inventory could not be loaded.';
        showMessage(error.message, 'danger');
    });
});
