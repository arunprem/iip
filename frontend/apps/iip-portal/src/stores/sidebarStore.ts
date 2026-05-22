import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SidebarState {
  collapsed: boolean;
  mobileOpen: boolean;
  toggleCollapsed: () => void;
  setCollapsed: (collapsed: boolean) => void;
  setMobileOpen: (open: boolean) => void;
  toggleMobile: () => void;
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set, get) => ({
      collapsed: false,
      mobileOpen: false,

      toggleCollapsed: () => set({ collapsed: !get().collapsed }),

      setCollapsed: (collapsed) => set({ collapsed }),

      setMobileOpen: (open) => set({ mobileOpen: open }),

      toggleMobile: () => set({ mobileOpen: !get().mobileOpen }),
    }),
    {
      name: 'iip-sidebar-storage',
      partialize: (state) => ({ collapsed: state.collapsed }),
    }
  )
);
