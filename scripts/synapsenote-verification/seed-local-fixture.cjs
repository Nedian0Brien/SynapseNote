const crypto = require('crypto');
const { execFileSync } = require('child_process');

const apiBase = process.env.API_URL || 'http://127.0.0.1:18080';
const jwtSecret = requiredEnv('GOTRUE_JWT_SECRET');
const userUuid = requiredEnv('SYNAPSENOTE_TEST_USER_UUID');
const userUid = requiredEnv('SYNAPSENOTE_TEST_USER_UID');
const userEmail = requiredEnv('SYNAPSENOTE_TEST_USER_EMAIL');
const fixtureWorkspaceName = 'Minjae의 Synapse';

function requiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function signJwt(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', jwtSecret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function accessToken() {
  const now = Math.floor(Date.now() / 1000);

  return signJwt({
    aud: 'authenticated',
    exp: now + 7 * 24 * 60 * 60,
    iat: now,
    sub: userUuid,
    email: userEmail,
    role: 'authenticated',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { email_verified: true },
  });
}

const token = accessToken();

async function api(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let json = {};

  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${options.method || 'GET'} ${path} returned non-JSON: ${response.status} ${text}`);
  }

  if (!response.ok || json.code !== 0) {
    throw new Error(`${options.method || 'GET'} ${path} failed: ${response.status} ${text}`);
  }

  return json.data;
}

async function getWorkspaces() {
  return api('/api/workspace?include_member_count=true');
}

async function getOutline(workspaceId) {
  const root = await api(`/api/workspace/${workspaceId}/view/${workspaceId}?depth=50`);

  return root.children || [];
}

function findByName(views, name) {
  for (const view of views || []) {
    if (view.name === name) return view;
    const child = findByName(view.children, name);

    if (child) return child;
  }
}

async function createWorkspace() {
  const workspaces = await getWorkspaces();
  const existing = workspaces.find((workspace) => workspace.workspace_name === fixtureWorkspaceName);

  if (existing) return existing.workspace_id;

  const data = await api('/api/workspace', {
    method: 'POST',
    body: JSON.stringify({ workspace_name: fixtureWorkspaceName }),
  });

  return data.workspace_id;
}

async function ensureSpace(workspaceId, name, icon) {
  let outline = await getOutline(workspaceId);
  let space = outline.find((view) => view.extra?.is_space && view.name === name);

  if (space) {
    if (icon && space.extra?.space_icon !== icon) {
      await api(`/api/workspace/${workspaceId}/space/${space.view_id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name,
          space_icon: icon,
          space_icon_color: '',
          space_permission: 0,
        }),
      });
      outline = await getOutline(workspaceId);
      space = outline.find((view) => view.view_id === space.view_id) || space;
    }

    return space;
  }

  const renameCandidate = outline.find(
    (view) => view.extra?.is_space && !['Product', 'Research', 'Personal'].includes(view.name)
  );

  if (renameCandidate && name === 'Product') {
    await api(`/api/workspace/${workspaceId}/space/${renameCandidate.view_id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name,
        space_icon: icon,
        space_icon_color: '',
        space_permission: 0,
      }),
    });
    outline = await getOutline(workspaceId);
    space = outline.find((view) => view.view_id === renameCandidate.view_id);
    return space;
  }

  const viewId = await api(`/api/workspace/${workspaceId}/space`, {
    method: 'POST',
    body: JSON.stringify({
      name,
      space_icon: icon,
      space_icon_color: '',
      space_permission: 0,
    }),
  });
  outline = await getOutline(workspaceId);
  return outline.find((view) => view.view_id === viewId || view.name === name);
}

async function ensurePage(workspaceId, parent, name, layout = 0, icon) {
  let outline = await getOutline(workspaceId);
  const currentParent = findByName(outline, parent.name) || parent;
  let page = (currentParent.children || []).find((child) => child.name === name);

  if (!page) {
    const prev = currentParent.children?.[currentParent.children.length - 1]?.view_id;
    const data = await api(`/api/workspace/${workspaceId}/page-view`, {
      method: 'POST',
      body: JSON.stringify({
        parent_view_id: currentParent.view_id,
        layout,
        name,
        prev_view_id: prev,
      }),
    });
    outline = await getOutline(workspaceId);
    page = findByName(outline, name) || { view_id: data.view_id, name, children: [] };
  }

  if (icon) {
    await api(`/api/workspace/${workspaceId}/page-view/${page.view_id}/update-icon`, {
      method: 'POST',
      body: JSON.stringify({ icon: { ty: 0, value: icon } }),
    });
  }

  return page;
}

async function favorite(workspaceId, page) {
  await api(`/api/workspace/${workspaceId}/page-view/${page.view_id}/favorite`, {
    method: 'POST',
    body: JSON.stringify({ is_favorite: true, is_pinned: false }),
  });
}

function psql(sql) {
  execFileSync(
    'docker',
    ['exec', 'appflowy-cloud-postgres-1', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', sql],
    { stdio: 'inherit' }
  );
}

function seedRecent(workspaceId, rows) {
  const fixtureNow = "timestamp with time zone '2026-06-29 11:00:00+00'";
  const values = rows
    .map(([page, interval]) => `(${userUid}, '${workspaceId}', '${page.view_id}', ${fixtureNow} - interval '${interval}')`)
    .join(',');

  psql(`
    insert into public.af_recent_views(uid, workspace_id, object_id, viewed_at)
    values ${values}
    on conflict (uid, workspace_id, object_id)
    do update set viewed_at = excluded.viewed_at;
  `);
}

function seedUnreadNotification(workspaceId, page) {
  psql(`
    insert into public.af_notification(
      id,
      workspace_id,
      recipient_uid,
      type,
      view_id,
      metadata,
      is_read,
      is_archived,
      created_at
    )
    values (
      '00000000-0000-0000-0000-000000000001',
      '${workspaceId}',
      ${userUid},
      'page_shared',
      '${page.view_id}',
      '{"actor_name":"Minjae","page_name":"Roadmap 2026","workspace_name":"Minjae의 Synapse"}'::jsonb,
      false,
      false,
      timestamp with time zone '2026-06-29 10:30:00+00'
    )
    on conflict (id)
    do update set
      workspace_id = excluded.workspace_id,
      recipient_uid = excluded.recipient_uid,
      type = excluded.type,
      view_id = excluded.view_id,
      metadata = excluded.metadata,
      is_read = false,
      is_archived = false,
      created_at = excluded.created_at;
  `);
}

function hideByName(workspaceId, names) {
  const quotedNames = names.map((name) => `'${name.replaceAll("'", "''")}'`).join(',');

  psql(`
    update public.af_folder_view
    set extra = coalesce(extra, '{}'::jsonb) || '{"is_hidden_space": true}'::jsonb
    where workspace_id = '${workspaceId}' and name in (${quotedNames});
  `);
}

function seedEditedTimes(workspaceId, rows) {
  const statements = rows
    .map(
      ([name, isoTime]) =>
        `update public.af_folder_view set last_edited_time = extract(epoch from timestamp with time zone '${isoTime}')::bigint where workspace_id = '${workspaceId}' and name = '${name.replaceAll("'", "''")}';`
    )
    .join('\n');

  psql(statements);
}

function setSynapseMeta(workspaceId, rows) {
  const statements = rows
    .map(([name, meta]) => {
      const json = JSON.stringify({ synapse: meta }).replaceAll("'", "''");

      return `
        update public.af_folder_view
        set extra = coalesce(extra, '{}'::jsonb) || '${json}'::jsonb
        where workspace_id = '${workspaceId}' and name = '${name.replaceAll("'", "''")}';
      `;
    })
    .join('\n');

  psql(statements);
}

async function main() {
  const workspaceId = await createWorkspace();

  await api(`/api/workspace/${workspaceId}/open`, { method: 'PUT' });

  const product = await ensureSpace(workspaceId, 'Product', '📦');
  const research = await ensureSpace(workspaceId, 'Research', '🔬');
  const personal = await ensureSpace(workspaceId, 'Personal', '🏠');

  const synapseRoadmap = await ensurePage(workspaceId, product, 'Synapse roadmap', 0);
  const roadmap2026 = await ensurePage(workspaceId, product, 'Roadmap 2026', 0);
  const releaseNotes = await ensurePage(workspaceId, product, 'Release notes', 0);
  const beta09 = await ensurePage(workspaceId, releaseNotes, 'v0.9 베타', 0);
  const launch10 = await ensurePage(workspaceId, releaseNotes, 'v1.0 출시', 0);
  const backlog = await ensurePage(workspaceId, product, '기능 백로그', 1);
  const q2Planning = await ensurePage(workspaceId, product, 'Q2 planning', 0);
  const meetingLog = await ensurePage(workspaceId, product, 'Meeting log', 0);
  const paperReview = await ensurePage(workspaceId, research, '논문 리뷰', 0);
  const experimentLog = await ensurePage(workspaceId, research, '실험 로그', 0);
  const weeklyTodo = await ensurePage(workspaceId, personal, '이번 주 할 일', 0, '📌');
  const readingNote = await ensurePage(workspaceId, personal, '독서 노트', 0);

  await favorite(workspaceId, synapseRoadmap);
  await favorite(workspaceId, weeklyTodo);
  await favorite(workspaceId, q2Planning);

  seedRecent(workspaceId, [
    [synapseRoadmap, '10 minutes'],
    [roadmap2026, '2 hours'],
    [paperReview, '1 day'],
    [meetingLog, '2 days'],
  ]);
  seedUnreadNotification(workspaceId, roadmap2026);
  hideByName(workspaceId, ['Shared', 'Getting started', 'To-dos']);
  seedEditedTimes(workspaceId, [
    ['Q2 planning', '2026-06-29 10:59:45+00'],
    ['이번 주 할 일', '2026-06-29 10:59:30+00'],
    ['Synapse roadmap', '2026-06-29 10:50:00+00'],
    ['Roadmap 2026', '2026-06-29 09:00:00+00'],
    ['Release notes', '2026-06-25 11:00:00+00'],
    ['v0.9 베타', '2026-06-24 11:00:00+00'],
    ['v1.0 출시', '2026-06-23 11:00:00+00'],
    ['기능 백로그', '2026-06-28 11:00:00+00'],
    ['논문 리뷰', '2026-06-28 11:00:00+00'],
    ['Meeting log', '2026-06-27 11:00:00+00'],
    ['실험 로그', '2026-06-26 11:00:00+00'],
    ['독서 노트', '2026-06-22 11:00:00+00'],
  ]);

  setSynapseMeta(workspaceId, [
    ['Product', { materialIcon: 'deployed_code', tileVariant: 'a' }],
    ['Research', { materialIcon: 'science', tileVariant: 'c' }],
    ['Personal', { materialIcon: 'person', tileVariant: 'd' }],
    ['Synapse roadmap', { materialIcon: 'hub', tags: ['전략', '2026'] }],
    ['Roadmap 2026', { materialIcon: 'description', tags: ['기획'] }],
    ['Release notes', { materialIcon: 'folder_open', tags: ['릴리스'] }],
    ['v0.9 베타', { materialIcon: 'description', tags: ['릴리스'] }],
    ['v1.0 출시', { materialIcon: 'description', tags: ['릴리스'] }],
    ['기능 백로그', { materialIcon: 'table', tags: ['DB'] }],
    ['Q2 planning', { materialIcon: 'edit_note', tags: ['계획'] }],
    ['Meeting log', { materialIcon: 'description', tags: ['회의'] }],
    ['논문 리뷰', { materialIcon: 'science', displayName: '논문 리뷰 — Graph RAG', tags: ['논문', 'RAG'] }],
    ['실험 로그', { materialIcon: 'science', displayName: '실험 로그 #14', tags: ['실험'] }],
    ['이번 주 할 일', { materialIcon: 'checklist', tags: ['할일'] }],
    ['독서 노트', { materialIcon: 'menu_book', tags: ['독서'] }],
  ]);

  psql(`
    update public.af_user set name = 'Minjae' where uid = ${userUid};
    update auth.users set raw_user_meta_data = raw_user_meta_data || '{"name":"Minjae"}'::jsonb where id = '${userUuid}';
  `);

  console.log(JSON.stringify({ workspaceId }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
