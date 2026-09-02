INSERT INTO "Menu" ("menuName", "url", "position")
SELECT 'License', '/license', 11
WHERE NOT EXISTS (SELECT 1 FROM "Menu" WHERE "url" = '/license');

INSERT INTO "RoleMenu" ("roleId", "menuId")
SELECT r.id, m.id
FROM "Role" r
CROSS JOIN "Menu" m
WHERE m."url" = '/license'
  AND r."roleName" = 'SuperAdmin'
  AND NOT EXISTS (
    SELECT 1 FROM "RoleMenu" rm WHERE rm."roleId" = r.id AND rm."menuId" = m.id
  );

INSERT INTO "RoleMenu" ("roleId", "menuId")
SELECT DISTINCT rm."roleId", m.id
FROM "RoleMenu" rm
JOIN "Menu" cm ON cm.id = rm."menuId" AND cm."url" = '/company-settings'
CROSS JOIN "Menu" m
WHERE m."url" = '/license'
  AND NOT EXISTS (
    SELECT 1 FROM "RoleMenu" x WHERE x."roleId" = rm."roleId" AND x."menuId" = m.id
  );
