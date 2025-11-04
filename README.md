### INF654 - Mobile Web Development
### Nicholas Kitchen
### Assignment 3

# Project Title
 
Assignment 3 Inventory Management
 
## Description
 
This program manages the inventory of the user. The user can add, modify, and delete items whether they are online or offline. The user can sort the list A-Z and also filter items by category.

### Offline Functionality
* The service worker will cache all resources needed for the app to function. It will process requests, and store data locally if the user is offline. The service worker will then sync with the database when a connection is re-established. 
* The caching strategy is to hold all resources for the application so it can be used offline. An internal database will also temporarily cache inventory items in case the user is offline. The idea for caching is that every part of the application should be usable at any point.
* The manifest details how the app should behave when installed on a device. It holds metadata for things like sizes for icons, display modes, and the color theme.
 
### Executing program
Launch with "Go Live" in Visual Studio Code. To test offline, go to Dev Tools -> Network -> Trottle = Offline. When you go back online, the application should sync with the database.
 
## Authors
 
Nicholas Kitchen
 
## Version History

* 0.1
    * Initial Release
