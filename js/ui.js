import { openDB } from "https://unpkg.com/idb?module";
import {
  addItemToFirebase,
  getItemsFromFirebase,
  deleteItemFromFirebase,
  updateItemInFirebase,
} from "./firebaseDB.js";

// --- Constants ---
const STORAGE_THRESHOLD = 0.8;

// --- Initialization and Event Listeners ---
document.addEventListener("DOMContentLoaded", function () {
  const menus = document.querySelector(".sidenav");
  M.Sidenav.init(menus, { edge: "right" });
  const forms = document.querySelector(".side-form");
  M.Sidenav.init(forms, { edge: "left" });

  // Sort select
  const sortSelect = document.querySelector("#sort-select");
  if (sortSelect) {
    M.FormSelect.init(sortSelect);
    sortSelect.addEventListener("change", (e) => {
      currentSort = e.target.value;
      renderItems();
    });
  }

  // Filter input
  const filterInput = document.querySelector("#filter-input");
  if (filterInput) {
    filterInput.addEventListener("input", (e) => {
      currentFilter = e.target.value.trim();
      renderItems();
    })
  }

  // Load items from IndexedDB and sync with Firebase
  loadItems();
  syncItems();
  checkStorageUsage();
  requestPersistentStorage();
});

// Register Service Worker
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("/serviceworker.js")
    .then((req) => console.log("Service Worker Registered!", req))
    .catch((err) => console.log("Service Worker registration failed", err));
}

// --- Database Operations ---

// Create or Get IndexedDB database instance
let dbPromise;
async function getDB() {
  if (!dbPromise) {
    dbPromise = openDB("inventoryManager", 1, {
      upgrade(db) {
        const store = db.createObjectStore("items", {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("synced", "synced");
      },
    });
  }
  return dbPromise;
}

// Sync unsynced items from IndexedDB to Firebase
async function syncItems() {
  const db = await getDB();
  const tx = db.transaction("items", "readonly");
  const store = tx.objectStore("items");
  const items = await store.getAll();
  await tx.done;

  for (const item of items) {
    if (!item.synced && isOnline()) {
      try {
        const itemToSync = {
          name: item.name,
          quantity: item.quantity,
          category: item.category,
        };
        const savedItem = await addItemToFirebase(itemToSync);
        const txUpdate = db.transaction("items", "readwrite");
        const storeUpdate = txUpdate.objectStore("items");
        await storeUpdate.delete(item.id);
        await storeUpdate.put({ ...item, id: savedItem.id, synced: true });
        await txUpdate.done;
      } catch (error) {
        console.error("Error syncing item:", error);
      }
    }
  }
}

// Check if the app is online
function isOnline() {
  return navigator.onLine;
}

// --- Item Management Functions ---

// Add Item (either to Firebase or IndexedDB)
async function addItem(item) {
  const db = await getDB();
  let itemId;

  if (isOnline()) {
    try {
      const savedItem = await addItemToFirebase(item);
      itemId = savedItem.id;
      const tx = db.transaction("items", "readwrite");
      const store = tx.objectStore("items");
      await store.put({ ...item, id: itemId, synced: true });
      await tx.done;
    } catch (error) {
      console.error("Error adding item to Firebase:", error);
    }
  } else {
    itemId = `temp-${Date.now()}`;
    const itemToStore = { ...item, id: itemId, synced: false };
    const tx = db.transaction("items", "readwrite");
    const store = tx.objectStore("items");
    await store.put(itemToStore);
    await tx.done;
  }

  checkStorageUsage();
  return { ...item, id: itemId };
}

// Edit Item with Transaction
async function editItem(id, updatedData) {
  if (!id) {
    console.error("Invalid ID passed to editItem.");
    return;
  }

  const db = await getDB();

  if (isOnline()) {
    try {
      await updateItemInFirebase(id, updatedData);
      // Update in IndexedDB as well
      const tx = db.transaction("items", "readwrite");
      const store = tx.objectStore("items");
      await store.put({ ...updatedData, id: id, synced: true });
      await tx.done;

      // Reload the entire item list to reflect the updates
      loadItems(); // Call loadItems here to refresh the UI
    } catch (error) {
      console.error("Error updating item in Firebase:", error);
    }
  } else {
    // If offline, make an IndexedDB transaction
    const tx = db.transaction("items", "readwrite");
    const store = tx.objectStore("items");
    await store.put({ ...updatedData, id: id, synced: false });
    await tx.done;
    loadItems(); // Refresh the UI with loadItems here as well
  }
}

// Delete Item with Transaction
async function deleteItem(id) {
  if (!id) {
    console.error("Invalid ID passed to deleteItem.");
    return;
  }
  const db = await getDB();
  if (isOnline()) {
    try {
      await deleteItemFromFirebase(id);
    } catch (error) {
      console.error("Error deleting item from Firebase:", error);
    }
  }

  const tx = db.transaction("items", "readwrite");
  const store = tx.objectStore("items");
  try {
    await store.delete(id);
  } catch (e) {
    console.error("Error deleting item from IndexedDB:", e);
  }
  await tx.done;

  const itemCard = document.querySelector(`[data-id="${id}"]`);
  if (itemCard) {
    itemCard.remove();
  }
  checkStorageUsage();
}


// Variables for the sort and filter
let allItems = [];
let currentSort = "none";
let currentFilter = "";

// --- UI Functions ---
// Load items and sync with Firebase if online
export async function loadItems() {
  const db = await getDB();
  const itemContainer = document.querySelector(".items");
  itemContainer.innerHTML = "";

  let itemsToDisplay = [];

  if (isOnline()) {
    const firebaseItems = await getItemsFromFirebase();
    const tx = db.transaction("items", "readwrite");
    const store = tx.objectStore("items");

    for (const item of firebaseItems) {
      await store.put({ ...item, synced: true });
    }
    await tx.done;

    itemsToDisplay = firebaseItems;
  } else {
    const tx = db.transaction("items", "readonly");
    const store = tx.objectStore("items");
    itemsToDisplay = await store.getAll();
    await tx.done;
  }

  allItems = itemsToDisplay;
  renderItems();
}

// Render Items in the UI
function renderItems() {
  const itemContainer = document.querySelector(".items");
  if (!itemContainer) return;
  itemContainer.innerHTML = "";

  // Filter by category
  let itemsToShow = allItems.filter(item => {
    if (!currentFilter) return true;
    return item.category.toLowerCase().includes(currentFilter.toLowerCase());
  });

  // Sort alphabetically
  if (currentSort === "name-asc") {
    itemsToShow.sort((a, b) => a.name.localeCompare(b.name));
  } else if (currentSort === "name-desc") {
    itemsToShow.sort((a, b) => b.name.localeCompare(a.name));
  }

  // Display items
  itemsToShow.forEach(displayItem);
}

// Display Item in the UI
function displayItem(item) {
  const itemContainer = document.querySelector(".items");

  // Check if the item already exists in the UI and remove it
  const existingItem = itemContainer.querySelector(`[data-id="${item.id}"]`);
  if (existingItem) {
    existingItem.remove();
  }

  // Create new item HTML and add it to the container
  const html = `                                   
      <div class="card-panel white row valign-wrapper" data-id=${item.id}>
        <div class="col s2">
          <img src="/img/icons/inventory.png" class="circle responsive-img" alt="Inventory icon" style="max-width: 100%; height: auto"/>
        </div>
        <div class="item-detail col s8">
          <h5 class="item-title black-text">${item.name}</h5>
          <div class="item-description">${item.quantity} units in stock (${item.category})</div>
        </div>
        <div class="col s2 right-align">
          <button class="item-delete btn-flat" aria-label="Delete item">
            <i class="material-icons black-text" style="font-size: 30px">delete</i>
          </button>
          <button class="item-edit btn-flat" aria-label="Edit item">
            <i class="material-icons black-text" style="font-size: 30px">edit</i>
          </button>
        </div>
      </div>
  `;
  itemContainer.insertAdjacentHTML("beforeend", html);

  const deleteButton = itemContainer.querySelector(
    `[data-id="${item.id}"] .item-delete`
  );
  deleteButton.addEventListener("click", () => deleteItem(item.id));

  const editButton = itemContainer.querySelector(
    `[data-id="${item.id}"] .item-edit`
  );
  editButton.addEventListener("click", () =>
    openEditForm(item.id, item.name, item.quantity, item.category)
  );
}

// Add/Edit Item Button Listener
const addItemButton = document.querySelector("#form-action-btn");
addItemButton.addEventListener("click", async () => {
  const nameInput = document.querySelector("#item-name");
  const quantityInput = document.querySelector("#item-quantity");
  const categoryInput = document.querySelector("#item-category");
  const itemIdInput = document.querySelector("#item-id");
  const formActionButton = document.querySelector("#form-action-btn");
  // Prepare the item data
  const itemId = itemIdInput.value; // If editing, this will have a value
  const itemData = {
    name: nameInput.value,
    quantity: quantityInput.value,
    category: categoryInput.value,
    status: "pending",
  };
  if (!itemId) {
    // If no itemId, we are adding a new item
    const savedItem = await addItem(itemData);
    displayItem(savedItem); // Display new item in the UI
  } else {
    // If itemId exists, we are editing an existing item
    await editItem(itemId, itemData); // Edit item in Firebase and IndexedDB
    loadItems(); // Refresh item list to show updated data
  }
  // Reset the button text and close the form
  formActionButton.textContent = "Add";
  closeForm();
});

// Open Edit Form with Existing Item Data
function openEditForm(id, name, quantity, category) {
  const nameInput = document.querySelector("#item-name");
  const quantityInput = document.querySelector("#item-quantity");
  const categoryInput = document.querySelector("#item-category");
  const itemIdInput = document.querySelector("#item-id");
  const formActionButton = document.querySelector("#form-action-btn");

  // Fill in the form with existing item data
  nameInput.value = name;
  quantityInput.value = quantity;
  categoryInput.value = category;
  itemIdInput.value = id; // Set itemId for the edit operation
  formActionButton.textContent = "Edit"; // Change the button text to "Edit"

  M.updateTextFields(); // Materialize CSS form update

  // Open the side form
  const forms = document.querySelector(".side-form");
  const instance = M.Sidenav.getInstance(forms);
  instance.open();
}

// Helper function to reset the form after use
function closeForm() {
  const nameInput = document.querySelector("#item-name");
  const quantityInput = document.querySelector("#item-quantity");
  const categoryInput = document.querySelector("#item-category");
  const itemIdInput = document.querySelector("#item-id");
  const formActionButton = document.querySelector("#form-action-btn");
  nameInput.value = "";
  quantityInput.value = "";
  categoryInput.value = "";
  itemIdInput.value = "";
  formActionButton.textContent = "Add";
  const forms = document.querySelector(".side-form");
  const instance = M.Sidenav.getInstance(forms);
  instance.close();
}

// Check storage usage and display warnings
async function checkStorageUsage() {
  if (navigator.storage && navigator.storage.estimate) {
    const { usage, quota } = await navigator.storage.estimate();
    const usageInMB = (usage / (1024 * 1024)).toFixed(2);
    const quotaInMB = (quota / (1024 * 1024)).toFixed(2);
    console.log(`Storage used: ${usageInMB} MB of ${quotaInMB} MB`);

    const storageInfo = document.querySelector("#storage-info");
    if (storageInfo) {
      storageInfo.textContent = `Storage used: ${usageInMB} MB of ${quotaInMB} MB`;
    }

    const storageWarning = document.querySelector("#storage-warning");
    if (usage / quota > STORAGE_THRESHOLD) {
      if (storageWarning) {
        storageWarning.textContent = "Warning: Running low on storage space.";
        storageWarning.style.display = "block";
      }
    } else if (storageWarning) {
      storageWarning.textContent = "";
      storageWarning.style.display = "none";
    }
  }
}

// Request persistent storage
async function requestPersistentStorage() {
  if (navigator.storage && navigator.storage.persist) {
    const isPersistent = await navigator.storage.persist();
    console.log(`Persistent storage granted: ${isPersistent}`);

    const storageMessage = document.querySelector("#persistent-storage-info");
    if (storageMessage) {
      storageMessage.textContent = isPersistent
        ? "Persistent storage granted!"
        : "Data might be cleared under storage pressure.";
      storageMessage.classList.toggle("green-text", isPersistent);
      storageMessage.classList.toggle("red-text", !isPersistent);
    }
  }
}

// Event listener to detect online status and sync
window.addEventListener("online", syncItems);
window.addEventListener("online", loadItems);
