window.initializeRequestPrinting = (state, { formatQuantity, formatDate, getStatusLabel, normalizeStatus }) => {
    const appendReportCell = (row, text, tagName = 'td') => {
        const cell = document.createElement(tagName);
        cell.textContent = text;
        row.appendChild(cell);
    };

    const addReportHeading = (container, text, tagName) => {
        const heading = document.createElement(tagName);
        heading.textContent = text;
        container.appendChild(heading);
    };

    const addManifestField = (container, label) => {
        const field = document.createElement('div');
        field.className = 'manifest-field';
        const fieldLabel = document.createElement('span');
        fieldLabel.textContent = label;
        field.appendChild(fieldLabel);
        container.appendChild(field);
    };

    const buildManifestReport = (request) => {
        const report = document.getElementById('printReport');
        report.replaceChildren();

        const manifest = document.createElement('section');
        const logo = document.createElement('img');
        logo.className = 'print-logo';
        logo.src = '../../assets/img/logo.png';
        logo.alt = 'Chick N Pastil';
        manifest.appendChild(logo);
        const title = document.createElement('h1');
        title.className = 'manifest-title';
        title.textContent = 'Delivery Manifest';
        manifest.appendChild(title);

        const requestDetails = document.createElement('p');
        requestDetails.textContent = [
            `Request ID: ${request.id}`,
            `Status: ${getStatusLabel(request.status)}`,
            `Submitted: ${formatDate(request.dateAndTime)}`,
        ].join(' · ');
        manifest.appendChild(requestDetails);

        addReportHeading(manifest, 'Branch and request details', 'h2');
        const branchDetails = document.createElement('p');
        branchDetails.textContent = [
            `Deliver to: ${request.branchName}`,
            `Address: ${request.branchAddress || '—'}`,
            `Requested by: ${request.requesterName || '—'}`,
        ].join(' · ');
        manifest.appendChild(branchDetails);
        [
            ['Request note', request.note],
            ['Rejection note', request.rejectionNote],
            ['Preparation note', request.preparationNote],
            ['Transit note', request.transitNote],
        ].forEach(([label, value]) => {
            const requestNote = document.createElement('p');
            requestNote.textContent = `${label}: ${value || ''}`;
            manifest.appendChild(requestNote);
        });

        addReportHeading(manifest, 'Items for delivery', 'h2');
        const itemsTable = document.createElement('table');
        itemsTable.className = 'manifest-items';
        const itemsHead = document.createElement('thead');
        const itemsHeader = document.createElement('tr');
        ['Item', 'Unit', 'Requested'].forEach((label) =>
            appendReportCell(itemsHeader, label, 'th'),
        );
        itemsHead.appendChild(itemsHeader);
        itemsTable.appendChild(itemsHead);

        const itemsRows = document.createElement('tbody');
        if (request.items.length === 0) {
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = 3;
            cell.textContent = 'No items in this request.';
            row.appendChild(cell);
            itemsRows.appendChild(row);
        } else {
            request.items.forEach((item) => {
                const row = document.createElement('tr');
                appendReportCell(row, item.name, 'th');
                appendReportCell(row, item.unitType);
                appendReportCell(row, formatQuantity(item.quantity));
                itemsRows.appendChild(row);
            });
        }
        itemsTable.appendChild(itemsRows);
        manifest.appendChild(itemsTable);

        addReportHeading(manifest, 'Delivery information', 'h2');
        const deliveryFields = document.createElement('div');
        deliveryFields.className = 'manifest-fields';
        [
            'Driver name',
            'Vehicle / plate number / Contact',
            'Dispatched by',
            'Dispatch date and time',
            'Receiver name',
            'Received date and time',
        ].forEach((label) => addManifestField(deliveryFields, label));
        manifest.appendChild(deliveryFields);

        addManifestField(manifest, 'Delivery notes');

        const signatures = document.createElement('div');
        signatures.className = 'manifest-signatures';
        ['Driver signature', 'Receiver signature'].forEach((label) => {
            const signature = document.createElement('div');
            signature.className = 'manifest-signature';
            signature.textContent = label;
            signatures.appendChild(signature);
        });
        manifest.appendChild(signatures);
        report.appendChild(manifest);
    };

    const buildPrintReport = () => {
        const report = document.getElementById('printReport');
        const preparingRequests = state.requests.filter(
            (request) => normalizeStatus(request.status) === 'preparing',
        );
        report.replaceChildren();

        const consolidatedPage = document.createElement('section');
        const logo = document.createElement('img');
        logo.className = 'print-logo';
        logo.src = '../../assets/img/logo.png';
        logo.alt = 'Chick N Pastil';
        consolidatedPage.appendChild(logo);
        addReportHeading(consolidatedPage, 'Consolidated Stock Request List', 'h1');
        const generatedDate = document.createElement('p');
        generatedDate.textContent = `Generated ${new Date().toLocaleString()} · Preparing requests only`;
        consolidatedPage.appendChild(generatedDate);

        const consolidatedTable = document.createElement('table');
        const consolidatedHead = document.createElement('thead');
        const consolidatedHeader = document.createElement('tr');
        ['Item', 'Unit', 'Total requested', 'Requests'].forEach((label) =>
            appendReportCell(consolidatedHeader, label, 'th'),
        );
        consolidatedHead.appendChild(consolidatedHeader);
        consolidatedTable.appendChild(consolidatedHead);

        const consolidatedRows = document.createElement('tbody');
        if (state.consolidatedItems.length === 0) {
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = 4;
            cell.textContent = 'No items are currently being prepared.';
            row.appendChild(cell);
            consolidatedRows.appendChild(row);
        } else {
            state.consolidatedItems.forEach((item) => {
                const row = document.createElement('tr');
                appendReportCell(row, item.name, 'th');
                appendReportCell(row, item.unitType);
                appendReportCell(row, formatQuantity(item.quantity));
                appendReportCell(row, item.requestCount);
                consolidatedRows.appendChild(row);
            });
        }
        consolidatedTable.appendChild(consolidatedRows);
        consolidatedPage.appendChild(consolidatedTable);
        report.appendChild(consolidatedPage);

        preparingRequests.forEach((request) => {
            const requestSection = document.createElement('section');
            requestSection.className = 'print-request';
            addReportHeading(requestSection, `Request ${request.id}`, 'h2');
            const details = document.createElement('p');
            details.textContent = [
                `Branch: ${request.branchName}`,
                `Requested by: ${request.requesterName || '—'}`,
                `Submitted: ${formatDate(request.dateAndTime)}`,
            ].join(' · ');
            requestSection.appendChild(details);

            if (request.note) {
                const note = document.createElement('p');
                note.textContent = `Request note: ${request.note}`;
                requestSection.appendChild(note);
            }
            if (request.preparationNote) {
                const note = document.createElement('p');
                note.textContent = `Preparation note: ${request.preparationNote}`;
                requestSection.appendChild(note);
            }

            const itemsTable = document.createElement('table');
            const itemsHead = document.createElement('thead');
            const itemsHeader = document.createElement('tr');
            ['Item', 'Unit', 'Quantity'].forEach((label) => appendReportCell(itemsHeader, label, 'th'));
            itemsHead.appendChild(itemsHeader);
            itemsTable.appendChild(itemsHead);

            const itemsRows = document.createElement('tbody');
            request.items.forEach((item) => {
                const row = document.createElement('tr');
                appendReportCell(row, item.name, 'th');
                appendReportCell(row, item.unitType);
                appendReportCell(row, formatQuantity(item.quantity));
                itemsRows.appendChild(row);
            });
            itemsTable.appendChild(itemsRows);
            requestSection.appendChild(itemsTable);
            report.appendChild(requestSection);
        });
    };

    document.getElementById('requestsTableBody').addEventListener('click', (event) => {
        const button = event.target.closest('[data-action="manifest"]');
        if (!button) return;
        const request = state.requests.find((item) => item.id === Number(button.dataset.requestId));
        if (!request) return;
        buildManifestReport(request);
        window.print();
    });

    document.getElementById('printConsolidatedList').addEventListener('click', () => {
        buildPrintReport();
        document.getElementById('consolidatedItemsModal').addEventListener('hidden.bs.modal', () => {
            window.print();
        }, { once: true });
        bootstrap.Modal.getOrCreateInstance(document.getElementById('consolidatedItemsModal')).hide();
    });
};
