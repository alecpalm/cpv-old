let authToken;

function setAuthToken(token) {
  authToken = token;
}

async function faunaFetch(query, token = authToken) {
  if (!token) throw new Error('No authentication token provided');
  const response = await fetch('/.netlify/functions/fauna', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ query }),
  });

  const result = await response.json();
  if (!result.success) {
    console.error('Fauna fetch error:', result.error, result.details);
    throw new Error(result.error || 'Unknown error occurred during Fauna fetch');
  }

  if (query.type === 'initialize') {
    return result.data || [];
  }
  return result.data;
}

async function initializeAdminPanel(token) {
  try {
    const decoded = jwt_decode(token);
    await logAuditEvent(decoded.email, 'login');
    
    const clientsQuery = { type: 'initialize', collection: 'clients' };
    window.clientsData = (await faunaFetch(clientsQuery, token)).map(doc => ({
      id: doc.ref['@ref'].id,
      name: doc.data.name,
      type: doc.data.type,
      description: doc.data.description,
      image: doc.data.image,
      highlight: doc.data.highlight || false,
      works: (doc.data.works || []).map(work => ({
        ...work,
        createdAt: work.createdAt !== undefined ? work.createdAt : Date.now(),
      })),
      createdAt: doc.data.createdAt !== undefined ? doc.data.createdAt : Date.now(),
    }));
    window.clientsData.sort((a, b) => a.createdAt - b.createdAt);
    window.clientsData.forEach(client => client.works?.sort((a, b) => a.createdAt - b.createdAt));

    window.globalWorks = window.clientsData.flatMap(client => 
      (client.works || []).map(work => ({ ...work, clientId: client.id, clientName: client.name }))
    ).sort((a, b) => a.createdAt - b.createdAt);

    const settingsQuery = { type: 'initialize', collection: 'settings' };
    window.settingsData = (await faunaFetch(settingsQuery, token))[0]?.data || {
      banner: {
        show: true,
        content: 'Our new website is live! Explore our updated portfolio and services.',
        version: 2,
        buttonText: 'Learn More',
        buttonLink: '#work',
      },
    };

    const shortLinksQuery = { type: 'initialize', collection: 'short_links' };
    window.shortLinks = (await faunaFetch(shortLinksQuery, token)).map(doc => ({
      id: doc.ref['@ref'].id,
      shortCode: doc.data.shortCode,
      destinationUrl: doc.data.destinationUrl,
      createdAt: doc.data.createdAt !== undefined ? doc.data.createdAt : Date.now(),
    })).sort((a, b) => a.createdAt - b.createdAt);

    if (!window.clientsData.length) {
      showNotification('No clients found. Add a new client to get started!', 'info');
    } else {
      showNotification('Successfully loaded!', 'success');
    }
    initializeUI();
  } catch (error) {
    console.error('Error initializing admin panel:', error.message);
    showNotification(`We couldn’t load your data: ${error.message}. Please try refreshing the page.`, 'error');
    window.clientsData = [];
    window.globalWorks = [];
    window.settingsData = {};
    window.shortLinks = [];
    initializeUI();
  }
}

async function saveClient() {
  if (!window.clientsData) window.clientsData = [];

  const form = DOM.clientForm;
  const clientId = document.getElementById('clientId').value;
  const name = document.getElementById('clientName').value;
  const type = document.getElementById('clientType').value;
  const description = document.getElementById('clientDescription').value;
  const image = document.getElementById('clientImage').value;
  const highlight = document.getElementById('clientHighlight').checked;
  const decoded = jwt_decode(authToken);

  if (!name) {
    showNotification('Client name is required.', 'error');
    return;
  }

  const existingClient = clientId ? findClientById(clientId) : null;
  const works = existingClient ? existingClient.works || [] : [];
  const clientData = {
    name,
    type,
    description,
    image,
    highlight,
    works,
    createdAt: existingClient && existingClient.createdAt ? existingClient.createdAt : Date.now(),
  };

  try {
    const query = existingClient
      ? { type: 'update', collection: 'clients', id: clientId, data: clientData }
      : { type: 'create', collection: 'clients', data: clientData };
    const result = await faunaFetch(query);
    await logAuditEvent(decoded.email, existingClient ? 'update_client' : 'create_client', { clientId: result.ref['@ref'].id });
    showNotification(existingClient ? 'Client updated!' : 'New client created!', 'success');
    await refreshData();
  } catch (error) {
    console.error('Error saving client:', error.message);
    showNotification(`We couldn’t save the client: ${error.message}. Please try again.`, 'error');
  } finally {
    closeAllModals();
  }
}

async function saveWork() {
  if (!window.clientsData) window.clientsData = [];
  if (!window.globalWorks) window.globalWorks = [];

  const form = DOM.workForm;
  const workId = document.getElementById('workId').value;
  const title = document.getElementById('workTitle').value;
  const clientId = document.getElementById('workClientSelect').value;
  const date = document.getElementById('workDate').value;
  const category = document.getElementById('workCategory').value;
  const designType = document.getElementById('workDesignType').value;
  const description = document.getElementById('workDescription').value;
  const thumbnail = document.getElementById('workThumbnail').value;
  const image = document.getElementById('workImage').value;
  const challenge = document.getElementById('workChallenge').value;
  const solution = document.getElementById('workSolution').value;
  const size = form.querySelector('input[name="workSize"]:checked')?.value || 'standard';
  const highlight = document.getElementById('workHighlight').checked;
  const outcomesList = document.getElementById('outcomesList');
  const deliverablesList = document.getElementById('deliverablesList');
  const solutionDetailsList = document.getElementById('solutionDetailsList');
  const linksList = document.getElementById('linksList');
  const galleryImagesList = document.getElementById('galleryImagesList');
  const decoded = jwt_decode(authToken);

  if (!title || !clientId) {
    showNotification('Work title and client are required.', 'error');
    return;
  }

  const results = Array.from(outcomesList.children).map(li => li.textContent.replace('×', '').trim());
  const deliverables = Array.from(deliverablesList.children).map(span => span.textContent.replace('×', '').trim());
  const solutionDetails = Array.from(solutionDetailsList.children).map(li => li.textContent.replace('×', '').trim());
  const linksText = Array.from(linksList.children).map(li => li.textContent.replace('×', '').trim());
  const links = linksText.map(text => {
    const [url, label] = text.split(' - ');
    return { url, label };
  });
  const gallery = Array.from(galleryImagesList.children).map(li => li.textContent.replace('×', '').trim());

  const existingWork = workId ? findWorkById(workId) : null;
  const workData = {
    id: workId || `${clientId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    title,
    date,
    category,
    designType,
    description,
    thumbnail,
    image,
    challenge,
    solution,
    solutionDetails,
    results,
    deliverables,
    links,
    gallery,
    size,
    highlight,
    createdAt: existingWork && existingWork.createdAt ? existingWork.createdAt : Date.now() + window.globalWorks.length,
    };

  const client = findClientById(clientId);
  if (!client) {
    showNotification('Selected client not found.', 'error');
    return;
  }

  const updatedWorks = existingWork
    ? client.works.map(w => w.id === workId ? workData : w)
    : [...client.works, workData];

  const clientData = { ...client, works: updatedWorks };

  try {
    const query = { type: 'update', collection: 'clients', id: clientId, data: clientData };
    await faunaFetch(query);
    await logAuditEvent(decoded.email, existingWork ? 'update_work' : 'create_work', { workId: workData.id, clientId });
    showNotification(existingWork ? 'Work updated!' : 'New work created!', 'success');
    await refreshData();
  } catch (error) {
    console.error('Error saving work:', error.message);
    showNotification(`We couldn’t save the work: ${error.message}. Please try again.`, 'error');
  } finally {
    closeAllModals();
  }
}

async function saveLink() {
  if (!window.shortLinks) window.shortLinks = [];

  const form = DOM.linkForm;
  const linkId = document.getElementById('linkId').value;
  const shortCode = document.getElementById('shortCode').value;
  const destinationUrl = document.getElementById('destinationUrl').value;
  const decoded = jwt_decode(authToken);

  if (!shortCode || !destinationUrl) {
    showNotification('Short code and destination URL are required.', 'error');
    return;
  }

  if (!linkId && window.shortLinks.some(l => l.shortCode === shortCode)) {
    showNotification('A short link with this code already exists!', 'error');
    return;
  }

  const existingLink = linkId ? window.shortLinks.find(l => l.id === linkId) : null;
  const linkData = {
    shortCode,
    destinationUrl,
    createdAt: existingLink && existingLink.createdAt ? existingLink.createdAt : Date.now(),
  };

  try {
    const query = existingLink
      ? { type: 'update', collection: 'short_links', id: linkId, data: linkData }
      : { type: 'create', collection: 'short_links', data: linkData };
    const result = await faunaFetch(query);
    await logAuditEvent(decoded.email, existingLink ? 'update_short_link' : 'create_short_link', { shortCode });
    showNotification(existingLink ? 'Short link updated!' : 'New short link created!', 'success');
    await refreshData();
  } catch (error) {
    console.error('Error saving short link:', error.message);
    showNotification(`We couldn’t save the short link: ${error.message}. Please try again.`, 'error');
  } finally {
    closeAllModals();
  }
}

async function saveSettings() {
  const bannerShow = document.getElementById('bannerShow').checked;
  const bannerContent = document.getElementById('bannerContent').value;
  const bannerVersion = parseInt(document.getElementById('bannerVersion').value, 10);
  const bannerButtonText = document.getElementById('bannerButtonText').value;
  const bannerButtonLink = document.getElementById('bannerButtonLink').value;
  const decoded = jwt_decode(authToken);

  const settingsData = {
    banner: {
      show: bannerShow,
      content: bannerContent,
      version: bannerVersion,
      buttonText: bannerButtonText,
      buttonLink: bannerButtonLink,
    },
  };

  try {
    const query = { type: 'update', collection: 'settings', id: '1', data: settingsData };
    await faunaFetch(query);
    await logAuditEvent(decoded.email, 'update_settings');
    showNotification('Settings updated successfully!', 'success');
    await refreshData();
  } catch (error) {
    console.error('Error saving settings:', error.message);
    showNotification(`We couldn’t save the settings: ${error.message}. Please try again.`, 'error');
  }
}

async function deleteClient(clientId) {
  if (!window.clientsData) {
    showNotification('No clients available. Please refresh the page.', 'error');
    return;
  }

  if (!confirm('Are you sure you want to delete this client? All associated works will also be deleted.')) return;
  const decoded = jwt_decode(authToken);
  try {
    const query = { type: 'delete', collection: 'clients', id: clientId };
    await faunaFetch(query);
    await logAuditEvent(decoded.email, 'delete_client', { clientId });
    showNotification('The client and all its works have been removed successfully.', 'success');
    await refreshData();
  } catch (error) {
    console.error('Error deleting client:', error.message);
    showNotification(`We couldn’t remove the client: ${error.message}. Please try again.`, 'error');
  }
}

async function deleteSelectedClients() {
  if (!window.clientsData) {
    showNotification('No clients available. Please refresh the page.', 'error');
    return;
  }

  const selectedIds = Array.from(document.querySelectorAll('.client-checkbox:checked')).map(cb => cb.getAttribute('data-id'));
  if (!selectedIds.length || !confirm(`Are you sure you want to delete ${selectedIds.length} selected clients? All associated works will also be deleted.`)) return;
  const decoded = jwt_decode(authToken);
  try {
    for (const id of selectedIds) {
      await deleteClient(id);
      await logAuditEvent(decoded.email, 'delete_client', { clientId: id });
    }
    DOM.deleteSelectedClientsBtn.style.display = 'none';
  } catch (error) {
    console.error('Error deleting selected clients:', error.message);
    showNotification(`We couldn’t delete the selected clients: ${error.message}. Please try again.`, 'error');
    await refreshData();
  }
}

async function deleteWork(workId, clientIdFromFilter = DOM.clientFilter.value) {
  if (!window.clientsData || !window.globalWorks) {
    showNotification('No works available. Please refresh the page.', 'error');
    return;
  }

  const work = findWorkById(workId);
  if (!work) {
    showNotification('Work not found. Please refresh the page and try again.', 'error');
    return;
  }

  const clientId = work.clientId;
  if (!confirm('Are you sure you want to delete this work?')) return;
  const decoded = jwt_decode(authToken);
  const client = findClientById(clientId);
  if (!client) {
    showNotification('Client not found for this work.', 'error');
    return;
  }

  const updatedWorks = client.works.filter(w => w.id !== workId);
  const clientData = { ...client, works: updatedWorks };

  try {
    const query = { type: 'update', collection: 'clients', id: clientId, data: clientData };
    await faunaFetch(query);
    await logAuditEvent(decoded.email, 'delete_work', { workId, clientId });
    showNotification('The work has been removed successfully.', 'success');
    await refreshData();
    if (clientIdFromFilter !== 'all') DOM.clientFilter.value = clientIdFromFilter;
  } catch (error) {
    console.error('Error deleting work:', error.message);
    showNotification(`We couldn’t remove the work: ${error.message}. Please try again.`, 'error');
  }
}

async function deleteSelectedWorks() {
  if (!window.globalWorks) {
    showNotification('No works available. Please refresh the page.', 'error');
    return;
  }

  const selectedIds = Array.from(document.querySelectorAll('.work-checkbox:checked')).map(cb => cb.getAttribute('data-id'));
  if (!selectedIds.length || !confirm(`Are you sure you want to delete ${selectedIds.length} selected works?`)) return;
  const decoded = jwt_decode(authToken);
  try {
    const worksByClient = {};
    selectedIds.forEach(workId => {
      const work = findWorkById(workId);
      if (work) {
        if (!worksByClient[work.clientId]) worksByClient[work.clientId] = [];
        worksByClient[work.clientId].push(workId);
      }
    });

    for (const [clientId, workIds] of Object.entries(worksByClient)) {
      const client = findClientById(clientId);
      if (!client) continue;
      const updatedWorks = client.works.filter(w => !workIds.includes(w.id));
      const clientData = { ...client, works: updatedWorks };
      const query = { type: 'update', collection: 'clients', id: clientId, data: clientData };
      await faunaFetch(query);
      for (const workId of workIds) {
        await logAuditEvent(decoded.email, 'delete_work', { workId, clientId });
      }
    }
    showNotification('Selected works have been removed successfully.', 'success');
    await refreshData();
    DOM.deleteSelectedWorksBtn.style.display = 'none';
  } catch (error) {
    console.error('Error deleting selected works:', error.message);
    showNotification(`We couldn’t delete the selected works: ${error.message}. Please try again.`, 'error');
    await refreshData();
  }
}

async function deleteLink(linkId) {
  if (!window.shortLinks) {
    showNotification('No short links available. Please refresh the page.', 'error');
    return;
  }

  if (!confirm('Are you sure you want to delete this short link?')) return;
  const decoded = jwt_decode(authToken);
  try {
    const query = { type: 'delete', collection: 'short_links', id: linkId };
    await faunaFetch(query);
    await logAuditEvent(decoded.email, 'delete_short_link', { linkId });
    showNotification('The short link has been removed successfully.', 'success');
    await refreshData();
  } catch (error) {
    console.error('Error deleting short link:', error.message);
    showNotification(`We couldn’t remove the short link: ${error.message}. Please try again.`, 'error');
  }
}

async function deleteSelectedLinks() {
  if (!window.shortLinks) {
    showNotification('No short links available. Please refresh the page.', 'error');
    return;
  }

  const selectedIds = Array.from(document.querySelectorAll('.link-checkbox:checked')).map(cb => cb.getAttribute('data-id'));
  if (!selectedIds.length || !confirm(`Are you sure you want to delete ${selectedIds.length} selected short links?`)) return;
  const decoded = jwt_decode(authToken);
  try {
    for (const id of selectedIds) {
      await deleteLink(id);
      await logAuditEvent(decoded.email, 'delete_short_link', { linkId: id });
    }
    DOM.deleteSelectedLinksBtn.style.display = 'none';
  } catch (error) {
    console.error('Error deleting selected short links:', error.message);
    showNotification(`We couldn’t delete the selected short links: ${error.message}. Please try again.`, 'error');
    await refreshData();
  }
}

async function moveClientUp(clientId) {
  const index = window.clientsData.findIndex(c => c.id === clientId);
  if (index <= 0) return;

  const clientToMove = window.clientsData[index];
  window.clientsData.splice(index, 1);
  window.clientsData.splice(index - 1, 0, clientToMove);

  window.clientsData.forEach((client, i) => {
    client.createdAt = i * 1000;
  });

  const decoded = jwt_decode(authToken);
  try {
    const promises = window.clientsData.map(client => {
      const query = { type: 'update', collection: 'clients', id: client.id, data: client };
      return faunaFetch(query);
    });
    await Promise.all(promises);
    await logAuditEvent(decoded.email, 'reorder_clients', { clientId, direction: 'up' });
    const row = DOM.clientsTableBody.querySelector(`tr[data-id="${clientId}"]`);
    if (row) animateRow(row);
    await refreshData();
  } catch (error) {
    console.error('Error moving client up:', error.message);
    showNotification(`We couldn’t reorder the clients: ${error.message}. Please try again.`, 'error');
    await refreshData();
  }
}

async function moveClientDown(clientId) {
  const index = window.clientsData.findIndex(c => c.id === clientId);
  if (index >= window.clientsData.length - 1) return;

  const clientToMove = window.clientsData[index];
  window.clientsData.splice(index, 1);
  window.clientsData.splice(index + 1, 0, clientToMove);

  window.clientsData.forEach((client, i) => {
    client.createdAt = i * 1000;
  });

  const decoded = jwt_decode(authToken);
  try {
    const promises = window.clientsData.map(client => {
      const query = { type: 'update', collection: 'clients', id: client.id, data: client };
      return faunaFetch(query);
    });
    await Promise.all(promises);
    await logAuditEvent(decoded.email, 'reorder_clients', { clientId, direction: 'down' });
    const row = DOM.clientsTableBody.querySelector(`tr[data-id="${clientId}"]`);
    if (row) animateRow(row);
    await refreshData();
  } catch (error) {
    console.error('Error moving client down:', error.message);
    showNotification(`We couldn’t reorder the clients: ${error.message}. Please try again.`, 'error');
    await refreshData();
  }
}

async function moveWorkUp(workId) {
  try {
    const currentWorkIndex = window.globalWorks.findIndex(w => w.id === workId);
    if (currentWorkIndex <= 0) return;

    const currentWork = window.globalWorks[currentWorkIndex];
    const previousWork = window.globalWorks[currentWorkIndex - 1];
    console.log('Before swap:', { current: currentWork.createdAt, previous: previousWork.createdAt });

    // Swap createdAt
    const temp = currentWork.createdAt;
    currentWork.createdAt = previousWork.createdAt;
    previousWork.createdAt = temp;
    console.log('After swap:', { current: currentWork.createdAt, previous: previousWork.createdAt });

    // Update clients
    const clientA = findClientById(currentWork.clientId);
    const clientB = findClientById(previousWork.clientId);
    const updatedWorksA = clientA.works.map(w => 
      w.id === currentWork.id ? { ...w, createdAt: currentWork.createdAt } : w
    );
    const clientAData = { ...clientA, works: updatedWorksA };
    console.log('Updating clientA:', clientA.id, updatedWorksA);
    await faunaFetch({ type: 'update', collection: 'clients', id: clientA.id, data: clientAData });

    if (clientB && clientA.id !== clientB.id) {
      const updatedWorksB = clientB.works.map(w => 
        w.id === previousWork.id ? { ...w, createdAt: previousWork.createdAt } : w
      );
      const clientBData = { ...clientB, works: updatedWorksB };
      console.log('Updating clientB:', clientB.id, updatedWorksB);
      await faunaFetch({ type: 'update', collection: 'clients', id: clientB.id, data: clientBData });
    }

    // Log and refresh
    await logAuditEvent(jwt_decode(authToken).email, 'reorder_works', {
      workId,
      previousWorkId: previousWork.id,
      direction: 'up'
    });
    const currentFilter = DOM.clientFilter.value;
    await refreshData();
    populateWorkTable(currentFilter);

    const row = DOM.worksTableBody.querySelector(`tr[data-id="${workId}"]`);
    if (row) animateRow(row);
  } catch (error) {
    console.error('Move up error:', error);
    showNotification(`We couldn't reorder the works: ${error.message}.`, 'error');
    const currentFilter = DOM.clientFilter.value;
    await refreshData();
    populateWorkTable(currentFilter);
  }
}

async function moveWorkDown(workId) {
  try {
    // Find the work in the global list
    const currentWorkIndex = window.globalWorks.findIndex(w => w.id === workId);
    if (currentWorkIndex >= window.globalWorks.length - 1) return; // Already at the bottom

    const currentWork = window.globalWorks[currentWorkIndex];
    const nextWork = window.globalWorks[currentWorkIndex + 1];
    if (!currentWork || !nextWork) throw new Error("Works not found");

    // Log before swap for debugging
    console.log('Before swap:', { current: currentWork.createdAt, next: nextWork.createdAt });

    // Swap createdAt timestamps
    const temp = currentWork.createdAt;
    currentWork.createdAt = nextWork.createdAt;
    nextWork.createdAt = temp;

    // Log after swap for debugging
    console.log('After swap:', { current: currentWork.createdAt, next: nextWork.createdAt });

    // Update the respective clients
    const clientA = findClientById(currentWork.clientId);
    const clientB = findClientById(nextWork.clientId);
    if (!clientA || (currentWork.clientId !== nextWork.clientId && !clientB)) {
      throw new Error("Client data not found");
    }

    // Update works arrays
    const updatedWorksA = clientA.works.map(w => 
      w.id === currentWork.id ? { ...w, createdAt: currentWork.createdAt } : w
    );
    const clientAData = { ...clientA, works: updatedWorksA };
    console.log('Updating clientA:', clientA.id, updatedWorksA);
    const queryA = { type: 'update', collection: 'clients', id: clientA.id, data: clientAData };
    await faunaFetch(queryA);

    if (clientB && clientA.id !== clientB.id) {
      const updatedWorksB = clientB.works.map(w => 
        w.id === nextWork.id ? { ...w, createdAt: nextWork.createdAt } : w
      );
      const clientBData = { ...clientB, works: updatedWorksB };
      console.log('Updating clientB:', clientB.id, updatedWorksB);
      const queryB = { type: 'update', collection: 'clients', id: clientB.id, data: clientBData };
      await faunaFetch(queryB);
    }

    // Log the event
    await logAuditEvent(jwt_decode(authToken).email, 'reorder_works', {
      workId,
      nextWorkId: nextWork.id,
      direction: 'down'
    });

    // Refresh and maintain current filter
    const currentFilter = DOM.clientFilter.value;
    await refreshData();
    populateWorkTable(currentFilter);

    // Animate the moved row
    const row = DOM.worksTableBody.querySelector(`tr[data-id="${workId}"]`);
    if (row) animateRow(row);
  } catch (error) {
    console.error('Error moving work down:', error.message);
    showNotification(`We couldn't reorder the works: ${error.message}.`, 'error');
    const currentFilter = DOM.clientFilter.value;
    await refreshData();
    populateWorkTable(currentFilter);
  }
}

function handleWorkMoveUp(e) {
  const btn = e.currentTarget;
  const workId = btn.dataset.id;
  btn.disabled = true;
  moveWorkUp(workId).finally(() => {
    setTimeout(() => btn.disabled = false, 1000);
  });
}

function handleWorkMoveDown(e) {
  const btn = e.currentTarget;
  const workId = btn.dataset.id;
  btn.disabled = true;
  moveWorkDown(workId).finally(() => {
    setTimeout(() => btn.disabled = false, 1000);
  });
}

async function logAuditEvent(userEmail, action, details = {}) {
  if (!window.isAdmin) return;
  const auditData = {
    userEmail,
    action,
    timestamp: Date.now(),
    details,
  };
  try {
    const query = { type: 'create', collection: 'audit_logs', data: auditData };
    await faunaFetch(query);
    if (window.isAdmin) populateAuditLogTable();
  } catch (error) {
    console.error('Error logging audit event:', error.message);
  }
}

async function fetchAuditLogs() {
  if (!window.isAdmin) return [];
  try {
    const query = { type: 'initialize', collection: 'audit_logs' };
    const logs = await faunaFetch(query);
    return logs.map(log => ({
      id: log.ref['@ref'].id,
      userEmail: log.data.userEmail,
      action: log.data.action,
      timestamp: log.data.timestamp,
      details: log.data.details || {},
    })).sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error('Error fetching audit logs:', error.message);
    throw error;
  }
}

function findClientById(clientId) {
  return window.clientsData.find(client => client.id === clientId);
}

function findWorkById(workId) {
  return window.globalWorks.find(work => work.id === workId);
}

async function refreshData() {
  if (!authToken) {
    showNotification('Please sign in again to refresh your data.', 'error');
    return;
  }

  try {
    const clientsQuery = { type: 'initialize', collection: 'clients' };
    window.clientsData = (await faunaFetch(clientsQuery)).map(doc => ({
      id: doc.ref['@ref'].id,
      name: doc.data.name,
      type: doc.data.type,
      description: doc.data.description,
      image: doc.data.image,
      highlight: doc.data.highlight || false,
      works: (doc.data.works || []).map(work => ({
        ...work,
        createdAt: work.createdAt !== undefined ? work.createdAt : Date.now(),
      })),
      createdAt: doc.data.createdAt !== undefined ? doc.data.createdAt : Date.now(),
    }));
    window.clientsData.sort((a, b) => a.createdAt - b.createdAt);
    window.clientsData.forEach(client => client.works?.sort((a, b) => a.createdAt - b.createdAt));

    window.globalWorks = window.clientsData.flatMap(client => 
      (client.works || []).map(work => ({ ...work, clientId: client.id, clientName: client.name }))
    ).sort((a, b) => a.createdAt - b.createdAt);

    const settingsQuery = { type: 'initialize', collection: 'settings' };
    window.settingsData = (await faunaFetch(settingsQuery))[0]?.data || {
      banner: {
        show: true,
        content: 'Our new website is live! Explore our updated portfolio and services.',
        version: 2,
        buttonText: 'Learn More',
        buttonLink: '#work',
      },
    };

    const shortLinksQuery = { type: 'initialize', collection: 'short_links' };
    window.shortLinks = (await faunaFetch(shortLinksQuery)).map(doc => ({
      id: doc.ref['@ref'].id,
      shortCode: doc.data.shortCode,
      destinationUrl: doc.data.destinationUrl,
      createdAt: doc.data.createdAt !== undefined ? doc.data.createdAt : Date.now(),
    })).sort((a, b) => a.createdAt - b.createdAt);

    populateClientTable();
    populateWorkTable();
    populateLinkTable();
    updateClientDropdowns();
    updateAllPreviews();
    setupClientActions();
    setupWorkActions();
    setupLinkActions();
  } catch (error) {
    console.error('Error refreshing data:', error.message);
    showNotification(`We couldn’t refresh your data: ${error.message}. Please try again.`, 'error');
    window.clientsData = [];
    window.globalWorks = [];
    window.settingsData = {};
    window.shortLinks = [];
  }
}

function signOut() {
  setAuthToken(null);
  window.clientsData = [];
  window.globalWorks = [];
  window.settingsData = {};
  window.shortLinks = [];
  window.isLoggedIn = false;

  showNotification('You’ve been signed out successfully.', 'success');

  setTimeout(() => {
    window.location.href = '/index.html'; 
  }, 1500); 
}