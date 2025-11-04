### INF654 - Mobile Web Development
### Nicholas Kitchen
### Implement Firebase and IndexedDB

# Project Title
 
Implement Firebase and IndexedDB - Inventory Management
 
## Description
 
This program manages the inventory of the user. The user can add, modify, and delete items whether they are online or offline. The user can sort the list A-Z and also filter items by category.

### Firebase and IndexedDB Functionality
The application will attempt to store and update items in Firebase. If online connection is not available, then items will be stored in the IndexedDB until connection is restored.
For different CRUD operations the following will occur if offline:
* **Reading Items**: Items will be pulled from the cached IndexedDB. When Firebase is online, the IndexedDB will be updated.
* **Adding Items**: Items will be given a temporary ID. When connection is restored, the item will be added to Firebase, and the temporary item in IndexedDB will be removed.
* **Updating Items**: Items will be marked as not synced. When connection is restored, those that are not synced will be synced.
* **Deleting Items**: Items will be marked for deletion. When connection is restored, those items will be removed from the Firebase database and IndexedDB.
 
### Executing program
Launch with "Go Live" in Visual Studio Code. To test offline, go to Dev Tools -> Network -> Trottle = Offline. When you go back online, the application should sync with the database.
 
## Authors
 
Nicholas Kitchen
 
## Version History

* 0.1
    * Initial Release
