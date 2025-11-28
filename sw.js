self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Intercept the POST request to share-target
  // Note: on GitHub pages, the pathname might include the repo name, so we check if it ends with share-target
  if (event.request.method === 'POST' && url.pathname.endsWith('share-target')) {
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData();
          const mediaFile = formData.get('media');

          if (mediaFile) {
            await saveSharedFile(mediaFile);
          }
        } catch (e) {
          console.error('Error handling share target:', e);
        }
        
        // Redirect back to the main app (./) instead of root (/)
        return Response.redirect('./', 303);
      })()
    );
  }
});

// Helper to save file to IndexedDB
function saveSharedFile(file) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('transcriber-share-db', 1);
    
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('shared-files')) {
        db.createObjectStore('shared-files');
      }
    };
    
    request.onsuccess = (e) => {
      const db = e.target.result;
      const tx = db.transaction('shared-files', 'readwrite');
      const store = tx.objectStore('shared-files');
      store.put(file, 'latest'); // We only store the latest shared file
      
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
    
    request.onerror = () => reject(request.error);
  });
}