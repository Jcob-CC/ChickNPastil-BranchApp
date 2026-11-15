document.addEventListener('DOMContentLoaded', () => {
    const state = {
        stockItems: [],
        recipes: [],
        batches: [],
        deliveries: [],
        purchaseOrders: [],
        wastages: [],
        movements: [],
        branches: [],
        role: '',
    };
    const errorBanner = document.getElementById('commissaryError');
    const noticeBanner = document.getElementById('commissaryNotice');
    const scannerPanel = document.getElementById('scannerPanel');
    const scannerMessage = document.getElementById('scannerMessage');
    const adjustmentModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('adjustmentModal'));
    const stockItemModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('stockItemModal'));
    let scanner = null;
    let noticeTimeout = null;

    const request = async (url, options = {}) => {
        const response = await fetch(url, {
            ...options,
            headers: { 'Content-Type': 'application/json', ...options.headers },
        });
        let result;
        try {
            result = await response.json();
        } catch {
            result = { message: `The request failed with status ${response.status}.` };
        }
        if (!response.ok) throw new Error(result.message || 'The commissary request could not be completed.');
        return result;
    };

    const post = (url, body) => request(url, { method: 'POST', body: JSON.stringify(body) });
    const put = (url, body) => request(url, { method: 'PUT', body: JSON.stringify(body) });

    const showError = (message) => {
        errorBanner.textContent = message;
        errorBanner.classList.remove('d-none');
        noticeBanner.classList.add('d-none');
    };

    const showNotice = (message) => {
        errorBanner.classList.add('d-none');
        noticeBanner.textContent = message;
        noticeBanner.classList.remove('d-none');
        window.clearTimeout(noticeTimeout);
        noticeTimeout = window.setTimeout(() => noticeBanner.classList.add('d-none'), 5000);
    };

    const setManagerVisibility = (root = document) => {
        const isManager = state.role === 'admin' || state.role === 'manager';
        root.querySelectorAll('.manager-only').forEach((element) => {
            element.hidden = !isManager;
        });
    };

    const clearFormErrors = () => {
        document.querySelectorAll('[data-modal-error]').forEach((element) => {
            element.textContent = '';
        });
    };

    const formatQuantity = (value) => Number(value).toLocaleString(undefined, { maximumFractionDigits: 3 });
    const formatCurrency = (value) => `PHP ${Number(value).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
    const formatDate = (value) => window.formatDbDate
        ? window.formatDbDate(value, { dateStyle: 'medium', timeStyle: 'short' })
        : value || '—';

    const appendCell = (row, value, className = '') => {
        const cell = document.createElement('td');
        cell.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
        if (className) cell.className = className;
        row.appendChild(cell);
        return cell;
    };

    const setEmptyRow = (body, columnCount, message) => {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = columnCount;
        cell.className = 'text-center text-secondary py-4';
        cell.textContent = message;
        row.appendChild(cell);
        body.replaceChildren(row);
    };

    const fillSelect = (select, items, placeholder, labelForItem) => {
        const selected = select.value;
        select.replaceChildren();
        const first = document.createElement('option');
        first.value = '';
        first.textContent = placeholder;
        select.appendChild(first);
        items.forEach((item) => {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = labelForItem(item);
            select.appendChild(option);
        });
        if (items.some((item) => String(item.id) === selected)) select.value = selected;
    };

    const rawMaterials = () => state.stockItems.filter((item) => item.kind === 'raw_material');
    const finishedGoods = () => state.stockItems.filter((item) => item.kind === 'finished_good');

    const refreshSelects = () => {
        const labelStockItem = (item) => `${item.name} (${formatQuantity(item.quantity)} ${item.unit})`;
        fillSelect(document.getElementById('recipeOutput'), finishedGoods(), 'Choose a finished good', labelStockItem);
        fillSelect(document.getElementById('batchRecipe'), state.recipes, 'Choose a recipe', (item) => item.name);
        fillSelect(document.getElementById('deliveryBranch'), state.branches, 'Choose a branch', (branch) => branch.location_name);
        fillSelect(document.getElementById('deliveryItem'), finishedGoods(), 'Choose a finished good', labelStockItem);
        fillSelect(document.getElementById('purchaseItem'), rawMaterials(), 'Choose a raw material', labelStockItem);
        fillSelect(document.getElementById('wastageItem'), state.stockItems, 'Choose a stock item', labelStockItem);
        document.querySelectorAll('.ingredient-item').forEach((select) => {
            fillSelect(select, rawMaterials(), 'Choose a raw material', (item) => `${item.name} (${item.unit})`);
        });
        document.getElementById('recipeOutput').disabled = finishedGoods().length === 0;
        document.getElementById('batchRecipe').disabled = state.recipes.length === 0;
        document.getElementById('deliveryBranch').disabled = state.branches.length === 0;
        document.getElementById('deliveryItem').disabled = finishedGoods().length === 0;
        document.getElementById('purchaseItem').disabled = rawMaterials().length === 0;
        document.getElementById('wastageItem').disabled = state.stockItems.length === 0;
    };

    const renderStock = () => {
        const body = document.getElementById('stockRows');
        body.replaceChildren();
        if (state.stockItems.length === 0) {
            setEmptyRow(body, 6, 'No commissary stock items yet. An admin or manager can add the initial catalog.');
            return;
        }
        state.stockItems.forEach((item) => {
            const row = document.createElement('tr');
            const name = appendCell(row, item.name);
            const category = document.createElement('small');
            category.className = 'd-block text-secondary';
            category.textContent = item.category || '';
            name.appendChild(category);
            appendCell(row, item.kind === 'raw_material' ? 'Raw material' : 'Finished good');
            const stockCell = appendCell(row, `${formatQuantity(item.quantity)} ${item.unit}`);
            if (Number(item.quantity) < Number(item.low_stock_threshold)) {
                const badge = document.createElement('span');
                badge.className = 'badge text-bg-warning ms-2';
                badge.textContent = 'Low';
                stockCell.appendChild(badge);
            }
            appendCell(row, `${formatQuantity(item.low_stock_threshold)} ${item.unit}`);
            appendCell(row, item.barcode);
            const actions = document.createElement('td');
            actions.className = 'text-end text-nowrap';
            const adjust = document.createElement('button');
            adjust.type = 'button';
            adjust.className = 'btn btn-sm btn-outline-success me-1';
            adjust.dataset.action = 'adjust';
            adjust.dataset.id = item.id;
            adjust.textContent = 'Adjust';
            actions.appendChild(adjust);
            const waste = document.createElement('button');
            waste.type = 'button';
            waste.className = 'btn btn-sm btn-outline-danger';
            waste.dataset.action = 'wastage';
            waste.dataset.id = item.id;
            waste.textContent = 'Wastage';
            actions.appendChild(waste);
            row.appendChild(actions);
            body.appendChild(row);
        });
        setManagerVisibility(body);
    };

    const renderRecipes = () => {
        const cards = document.getElementById('recipeCards');
        cards.replaceChildren();
        if (state.recipes.length === 0) {
            const message = document.createElement('p');
            message.className = 'text-secondary mb-0';
            message.textContent = 'No recipes yet. Add a finished good and raw materials to define a production recipe.';
            cards.appendChild(message);
            return;
        }
        state.recipes.forEach((recipe) => {
            const column = document.createElement('div');
            column.className = 'col-12 col-md-6 col-xxl-4';
            const card = document.createElement('article');
            card.className = 'border rounded-3 h-100 p-3 bg-light-subtle';
            const heading = document.createElement('h3');
            heading.className = 'h6';
            heading.textContent = recipe.name;
            const yieldText = document.createElement('p');
            yieldText.className = 'small text-secondary mb-2';
            yieldText.textContent = `Yield: ${formatQuantity(recipe.yield_quantity)} ${recipe.output_unit} · ${recipe.output_item_name}`;
            const list = document.createElement('ul');
            list.className = 'small mb-0 ps-3';
            recipe.ingredients.forEach((ingredient) => {
                const item = document.createElement('li');
                item.textContent = `${formatQuantity(ingredient.quantity)} ${ingredient.unit} · ${ingredient.name}`;
                list.appendChild(item);
            });
            card.append(heading, yieldText, list);
            if (recipe.description) {
                const description = document.createElement('p');
                description.className = 'small mb-2';
                description.textContent = recipe.description;
                card.insertBefore(description, list);
            }
            column.appendChild(card);
            cards.appendChild(column);
        });
    };

    const renderBatches = () => {
        const body = document.getElementById('batchRows');
        body.replaceChildren();
        if (state.batches.length === 0) {
            setEmptyRow(body, 4, 'No batches planned.');
            return;
        }
        state.batches.forEach((batch) => {
            const row = document.createElement('tr');
            appendCell(row, `BATCH-${String(batch.id).padStart(4, '0')}`);
            appendCell(row, `${batch.recipe_name} · ${formatQuantity(batch.target_yield)} ${batch.output_unit}`);
            const statusCell = appendCell(row, batch.status.replace('_', ' '));
            const status = document.createElement('span');
            status.className = `badge status-badge ${batch.status === 'completed' ? 'text-bg-success' : batch.status === 'in_progress' ? 'text-bg-primary' : 'text-bg-secondary'}`;
            status.textContent = batch.status.replace('_', ' ');
            statusCell.textContent = '';
            statusCell.appendChild(status);
            const actions = document.createElement('td');
            actions.className = 'text-end';
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'btn btn-sm btn-outline-success';
            button.dataset.id = batch.id;
            if (batch.status === 'planned') {
                button.dataset.action = 'start-batch';
                button.textContent = 'Start batch';
            } else if (batch.status === 'in_progress') {
                button.dataset.action = 'complete-batch';
                button.textContent = 'Complete batch';
            } else {
                button.textContent = 'Completed';
                button.disabled = true;
            }
            actions.appendChild(button);
            row.appendChild(actions);
            body.appendChild(row);
        });
        setManagerVisibility(body);
    };

    const renderDeliveries = () => {
        const body = document.getElementById('deliveryRows');
        body.replaceChildren();
        if (state.deliveries.length === 0) {
            setEmptyRow(body, 6, 'No deliveries created yet.');
            return;
        }
        state.deliveries.forEach((delivery) => {
            const row = document.createElement('tr');
            appendCell(row, `DEL-${String(delivery.id).padStart(4, '0')}`);
            appendCell(row, delivery.branch_name);
            appendCell(row, delivery.items.map((item) =>
                `${item.name}: ${formatQuantity(item.quantity)} ${item.unit}`).join(', '));
            const statusCell = appendCell(row, '');
            const badge = document.createElement('span');
            badge.className = `badge status-badge ${delivery.status === 'in_transit' ? 'text-bg-primary' : 'text-bg-success'}`;
            badge.textContent = delivery.status.replace('_', ' ');
            statusCell.appendChild(badge);
            appendCell(row, formatDate(delivery.created_at));
            const actions = document.createElement('td');
            actions.className = 'text-end';
            if (delivery.status === 'ready') {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'btn btn-sm btn-success manager-only';
                button.dataset.action = 'dispatch-delivery';
                button.dataset.id = delivery.id;
                button.textContent = 'Dispatch';
                actions.appendChild(button);
            } else {
                actions.textContent = 'Dispatched';
            }
            row.appendChild(actions);
            body.appendChild(row);
        });
        setManagerVisibility(body);
    };

    const renderPurchaseOrders = () => {
        const body = document.getElementById('purchaseOrderRows');
        body.replaceChildren();
        if (state.purchaseOrders.length === 0) {
            setEmptyRow(body, 7, 'No purchase orders created yet.');
            return;
        }
        state.purchaseOrders.forEach((order) => {
            const row = document.createElement('tr');
            appendCell(row, `PO-${String(order.id).padStart(4, '0')}`);
            appendCell(row, order.supplier_name);
            appendCell(row, order.items.map((item) =>
                `${item.name}: ${formatQuantity(item.quantity)} ${item.unit}`).join(', '));
            appendCell(row, formatCurrency(order.total_value));
            const statusCell = appendCell(row, '');
            const badge = document.createElement('span');
            badge.className = `badge status-badge ${order.status === 'received' ? 'text-bg-success' : order.status === 'approved' ? 'text-bg-primary' : 'text-bg-warning'}`;
            badge.textContent = order.status;
            statusCell.appendChild(badge);
            appendCell(row, formatDate(order.created_at));
            const actions = document.createElement('td');
            actions.className = 'text-end text-nowrap';
            if (order.status === 'draft') {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'btn btn-sm btn-outline-success manager-only';
                button.dataset.action = 'approve-po';
                button.dataset.id = order.id;
                button.textContent = 'Approve';
                actions.appendChild(button);
            } else if (order.status === 'approved') {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'btn btn-sm btn-outline-primary';
                button.dataset.action = 'receive-po';
                button.dataset.id = order.id;
                button.textContent = 'Receive stock';
                actions.appendChild(button);
            } else {
                actions.textContent = 'Received';
            }
            row.appendChild(actions);
            body.appendChild(row);
        });
        setManagerVisibility(body);
    };

    const renderWastages = () => {
        const body = document.getElementById('wastageRows');
        body.replaceChildren();
        if (state.wastages.length === 0) {
            setEmptyRow(body, 5, 'No wastage has been recorded.');
        } else {
            state.wastages.forEach((wastage) => {
                const row = document.createElement('tr');
                appendCell(row, formatDate(wastage.created_at));
                appendCell(row, wastage.item_name);
                appendCell(row, `${formatQuantity(wastage.quantity)} ${wastage.unit}`);
                appendCell(row, wastage.reason);
                appendCell(row, wastage.recorded_by || '—');
                body.appendChild(row);
            });
        }

        const movements = document.getElementById('movementRows');
        movements.replaceChildren();
        if (state.movements.length === 0) {
            setEmptyRow(movements, 5, 'No stock movements recorded.');
        } else {
            state.movements.forEach((movement) => {
                const row = document.createElement('tr');
                appendCell(row, formatDate(movement.created_at));
                appendCell(row, movement.item_name);
                appendCell(row, `${Number(movement.quantity_change) > 0 ? '+' : ''}${formatQuantity(movement.quantity_change)} ${movement.unit}`);
                appendCell(row, movement.reason);
                appendCell(row, movement.updated_by || '—');
                movements.appendChild(row);
            });
        }
    };

    const applyRoleVisibility = async () => {
        try {
            const session = await request('/user/session');
            const role = String(session.role || '').toLowerCase();
            state.role = role;
            document.querySelectorAll('.manager-only').forEach((element) => {
                element.hidden = role !== 'admin' && role !== 'manager';
            });
        } catch (error) {
            showError(error.message);
        }
    };

    const loadData = async () => {
        try {
            const data = await request('/commissary/data');
            Object.assign(state, data);
            refreshSelects();
            renderStock();
            renderRecipes();
            renderBatches();
            renderDeliveries();
            renderPurchaseOrders();
            renderWastages();
            return true;
        } catch (error) {
            showError(error.message);
            return false;
        }
    };

    const refreshAfter = async (message) => {
        if (await loadData()) showNotice(message);
    };

    const selectTab = (name) => {
        const tabNames = ['inventory', 'production', 'deliveries', 'procurement', 'wastage'];
        const selected = tabNames.includes(name) ? name : 'inventory';
        document.querySelectorAll('.commissary-panel').forEach((panel) => {
            panel.classList.toggle('d-none', panel.id !== `tab-${selected}`);
        });
        document.querySelectorAll('#commissaryTabs [data-tab]').forEach((button) => {
            button.classList.toggle('active', button.dataset.tab === selected);
        });
    };

    const addIngredientRow = () => {
        const row = document.createElement('div');
        row.className = 'ingredient-row';
        const item = document.createElement('select');
        item.className = 'form-select ingredient-item';
        item.required = true;
        const quantity = document.createElement('input');
        quantity.className = 'form-control ingredient-quantity';
        quantity.type = 'number';
        quantity.min = '0.01';
        quantity.step = 'any';
        quantity.placeholder = 'Qty';
        quantity.required = true;
        const remove = document.createElement('button');
        remove.className = 'btn btn-outline-danger';
        remove.type = 'button';
        remove.dataset.action = 'remove-ingredient';
        remove.setAttribute('aria-label', 'Remove ingredient');
        remove.innerHTML = '<i class="bi bi-x-lg" aria-hidden="true"></i>';
        row.append(item, quantity, remove);
        document.getElementById('recipeIngredients').appendChild(row);
        refreshSelects();
    };

    const openAdjustment = (item) => {
        clearFormErrors();
        document.getElementById('adjustmentItemId').value = item.id;
        document.getElementById('adjustmentItemLabel').textContent =
            `${item.name} · current ${formatQuantity(item.quantity)} ${item.unit}`;
        document.getElementById('adjustmentQuantity').value = '';
        document.getElementById('adjustmentReason').value = '';
        adjustmentModal.show();
    };

    const findScannedItem = (barcode) => {
        const item = state.stockItems.find((stockItem) => stockItem.barcode === barcode);
        if (!item) {
            scannerMessage.textContent = 'No active stock item matches that code. Add the code to an item or enter another code.';
            return;
        }
        scannerMessage.textContent = `Matched ${item.name}. Confirm a stock adjustment to continue.`;
        openAdjustment(item);
    };

    const stopScanner = async () => {
        if (!scanner) return;
        const activeScanner = scanner;
        scanner = null;
        try {
            await activeScanner.clear();
        } catch (error) {
            console.error('Unable to stop the commissary scanner:', error);
            scannerMessage.textContent = 'The camera scanner could not be stopped cleanly. Manual barcode entry is still available.';
        }
    };

    const startScanner = async () => {
        scannerPanel.classList.remove('d-none');
        scannerMessage.textContent = '';
        if (typeof Html5QrcodeScanner === 'undefined') {
            scannerMessage.textContent = 'Camera scanning is unavailable. Use manual barcode entry below.';
            return;
        }
        if (scanner) await stopScanner();
        const formats = [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
        ];
        try {
            scanner = new Html5QrcodeScanner('scannerReader', {
                fps: 10,
                qrbox: { width: 220, height: 220 },
                formatsToSupport: formats,
                rememberLastUsedCamera: true,
            }, false);
            scanner.render((decodedText) => {
                const code = decodedText.trim();
                document.getElementById('manualBarcode').value = code;
                stopScanner();
                findScannedItem(code);
            }, (scannerError) => {
                if (/permission|camera|device/i.test(String(scannerError))) {
                    scannerMessage.textContent = 'Camera access failed. Allow camera access or use manual barcode entry.';
                }
            });
        } catch (error) {
            console.error('Unable to start the commissary scanner:', error);
            scanner = null;
            scannerMessage.textContent = 'The camera scanner could not start. Use manual barcode entry instead.';
        }
    };

    const submitWithError = async (event, action) => {
        event.preventDefault();
        clearFormErrors();
        errorBanner.classList.add('d-none');
        try {
            await action();
        } catch (error) {
            const modalError = event.currentTarget.querySelector('[data-modal-error]');
            if (modalError) modalError.textContent = error.message;
            else showError(error.message);
        }
    };

    document.getElementById('commissaryTabs').addEventListener('click', (event) => {
        const button = event.target.closest('[data-tab]');
        if (!button) return;
        selectTab(button.dataset.tab);
        window.history.replaceState(null, '', `#${button.dataset.tab}`);
    });

    window.addEventListener('hashchange', () => selectTab(window.location.hash.slice(1)));
    selectTab(window.location.hash.slice(1));
    document.getElementById('scannerToggle').addEventListener('click', startScanner);
    document.getElementById('scannerStop').addEventListener('click', async () => {
        await stopScanner();
        scannerPanel.classList.add('d-none');
    });
    document.getElementById('manualBarcodeLookup').addEventListener('click', () => {
        const code = document.getElementById('manualBarcode').value.trim();
        if (!code) {
            scannerMessage.textContent = 'Enter a barcode or QR value.';
            return;
        }
        findScannedItem(code);
    });
    document.getElementById('manualBarcode').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            document.getElementById('manualBarcodeLookup').click();
        }
    });

    document.getElementById('stockItemForm').addEventListener('submit', (event) => submitWithError(event, async () => {
        await post('/commissary/items', {
            name: document.getElementById('stockItemName').value,
            kind: document.getElementById('stockItemKind').value,
            unit: document.getElementById('stockItemUnit').value,
            category: document.getElementById('stockItemCategory').value,
            barcode: document.getElementById('stockItemBarcode').value,
            quantity: document.getElementById('stockItemQuantity').value,
            low_stock_threshold: document.getElementById('stockItemThreshold').value,
            unit_cost: document.getElementById('stockItemCost').value,
        });
        stockItemModal.hide();
        event.currentTarget.reset();
        await refreshAfter('Stock item created.');
    }));

    document.getElementById('adjustmentForm').addEventListener('submit', (event) => submitWithError(event, async () => {
        const id = document.getElementById('adjustmentItemId').value;
        await put(`/commissary/items/${id}/adjust`, {
            quantity_change: document.getElementById('adjustmentQuantity').value,
            reason: document.getElementById('adjustmentReason').value,
        });
        adjustmentModal.hide();
        await refreshAfter('Stock adjustment saved.');
    }));

    document.getElementById('addIngredient').addEventListener('click', addIngredientRow);
    document.getElementById('recipeForm').addEventListener('submit', (event) => submitWithError(event, async () => {
        const ingredients = Array.from(document.querySelectorAll('#recipeIngredients .ingredient-row')).map((row) => ({
            stock_item_id: row.querySelector('.ingredient-item').value,
            quantity: row.querySelector('.ingredient-quantity').value,
        }));
        await post('/commissary/recipes', {
            name: document.getElementById('recipeName').value,
            description: document.getElementById('recipeDescription').value,
            output_stock_item_id: document.getElementById('recipeOutput').value,
            yield_quantity: document.getElementById('recipeYield').value,
            ingredients,
        });
        event.currentTarget.reset();
        document.getElementById('recipeIngredients').replaceChildren();
        addIngredientRow();
        await refreshAfter('Recipe saved.');
    }));

    document.getElementById('batchRecipe').addEventListener('change', (event) => {
        const recipe = state.recipes.find((item) => String(item.id) === event.target.value);
        if (recipe) document.getElementById('batchYield').value = recipe.yield_quantity;
    });
    document.getElementById('batchForm').addEventListener('submit', (event) => submitWithError(event, async () => {
        await post('/commissary/batches', {
            recipe_id: document.getElementById('batchRecipe').value,
            target_yield: document.getElementById('batchYield').value,
        });
        event.currentTarget.reset();
        await refreshAfter('Production batch planned.');
    }));

    document.getElementById('deliveryForm').addEventListener('submit', (event) => submitWithError(event, async () => {
        await post('/commissary/deliveries', {
            branch_location_id: document.getElementById('deliveryBranch').value,
            items: [{
                stock_item_id: document.getElementById('deliveryItem').value,
                quantity: document.getElementById('deliveryQuantity').value,
            }],
        });
        event.currentTarget.reset();
        await refreshAfter('Delivery created and ready for dispatch.');
    }));

    document.getElementById('purchaseOrderForm').addEventListener('submit', (event) => submitWithError(event, async () => {
        await post('/commissary/purchase-orders', {
            supplier_name: document.getElementById('supplierName').value,
            items: [{
                stock_item_id: document.getElementById('purchaseItem').value,
                quantity: document.getElementById('purchaseQuantity').value,
                unit_cost: document.getElementById('purchaseUnitCost').value,
            }],
        });
        event.currentTarget.reset();
        await refreshAfter('Purchase order saved as a draft.');
    }));

    document.getElementById('generateLowStockPO').addEventListener('click', async () => {
        try {
            const result = await post('/commissary/purchase-orders/generate-low-stock', {
                supplier_name: document.getElementById('supplierName').value,
            });
            await refreshAfter(`Low-stock purchase order drafted with ${result.itemCount} item(s).`);
        } catch (error) {
            showError(error.message);
        }
    });

    document.getElementById('wastageForm').addEventListener('submit', (event) => submitWithError(event, async () => {
        const itemId = document.getElementById('wastageItem').value;
        await post(`/commissary/items/${itemId}/wastage`, {
            quantity: document.getElementById('wastageQuantity').value,
            reason: document.getElementById('wastageReason').value,
        });
        event.currentTarget.reset();
        await refreshAfter('Wastage recorded and stock updated.');
    }));

    document.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-action]');
        if (!button) return;
        const id = button.dataset.id;
        try {
            if (button.dataset.action === 'remove-ingredient') {
                button.closest('.ingredient-row').remove();
            } else if (button.dataset.action === 'adjust') {
                const item = state.stockItems.find((stockItem) => String(stockItem.id) === id);
                if (item) openAdjustment(item);
            } else if (button.dataset.action === 'wastage') {
                document.getElementById('wastageItem').value = id;
                selectTab('wastage');
                window.history.replaceState(null, '', '#wastage');
                document.getElementById('wastageQuantity').focus();
            } else if (button.dataset.action === 'start-batch') {
                await put(`/commissary/batches/${id}/start`, {});
                await refreshAfter('Batch started; raw materials have been deducted.');
            } else if (button.dataset.action === 'complete-batch') {
                await put(`/commissary/batches/${id}/complete`, {});
                await refreshAfter('Batch completed; finished goods have been added to warehouse stock.');
            } else if (button.dataset.action === 'approve-po') {
                await put(`/commissary/purchase-orders/${id}/approve`, {});
                await refreshAfter('Purchase order approved.');
            } else if (button.dataset.action === 'receive-po') {
                await put(`/commissary/purchase-orders/${id}/receive`, {});
                await refreshAfter('Purchase order received; warehouse stock updated.');
            } else if (button.dataset.action === 'dispatch-delivery') {
                await put(`/commissary/deliveries/${id}/dispatch`, {});
                await refreshAfter('Delivery dispatched; commissary finished goods deducted.');
            }
        } catch (error) {
            showError(error.message);
        }
    });

    window.addEventListener('beforeunload', () => {
        if (scanner) scanner.clear();
    });

    applyRoleVisibility();
    loadData().then(() => setManagerVisibility());
});
