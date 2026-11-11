/**
 * Navigator search: retain a matching item's ancestry, without modifying the
 * MobX sidebar registry or the user's persistent expand/collapse preferences.
 */
import type { HierarchicalSidebarItem } from "./sidebar-items.injectable";

export function filterNavigatorItems(items: HierarchicalSidebarItem[], rawQuery: string): HierarchicalSidebarItem[] {
  const query = rawQuery.trim().toLocaleLowerCase();

  if (!query) return items;

  return items.flatMap(item => {
    const title = typeof item.title === "string" ? item.title : "";
    const matchingChildren = filterNavigatorItems(item.children, query);
    const matches = `${item.id} ${title}`.toLocaleLowerCase().includes(query);

    if (matches) return [item];
    if (matchingChildren.length > 0) return [{ ...item, children: matchingChildren }];

    return [];
  });
}
