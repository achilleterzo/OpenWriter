---

# ActivityBar.jsx

Source: [`src/components/ActivityBar.jsx`](../../../../../src/components/ActivityBar.jsx)

Side rail of the workspace, with one button per side tab and the buttons at the bottom.

The side tabs are exported as `sideTabs`, in this order: **Projects**, **Files**, **Outline**, **Notes**, **Bookmarks**, **History**, **Memory**. The active one is highlighted with an accent left border, and each button carries its label as a tooltip and accessible name.

At the bottom: an update button when a new release is known (it reports the version and opens the update), and the button that opens the settings screen (Ctrl+,).