const db = require('../config/db');
const ApiError = require('../utils/apiError');

const DEFAULT_SORT = 'submitted_at DESC';

const normalizeFiling = (row) => ({
  id: row.id,
  filingType: row.filing_type,
  title: row.title,
  referenceNumber: row.reference_number,
  identifier: row.identifier,
  status: row.status,
  agentId: row.agent_id,
  assignedAt: row.assigned_at,
  submittedAt: row.submitted_at,
  updatedAt: row.updated_at,
  createdAt: row.created_at,
});

const buildListQuery = ({ query }) => {
  const values = [];
  const conditions = [];
  let index = 1;

  if (query.status) {
    conditions.push(`combined.status = $${index}`);
    values.push(query.status);
    index += 1;
  }

  if (query.unassigned) {
    conditions.push('combined.agent_id IS NULL');
  }

  if (query.type === 'patent') {
    conditions.push("combined.filing_type = 'PATENT'");
  }

  if (query.type === 'nonPatent') {
    conditions.push("combined.filing_type <> 'PATENT'");
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const offset = query.page * query.size;

  const baseCombined = `
    SELECT
      id,
      'PATENT' AS filing_type,
      title,
      reference_number,
      patent_id AS identifier,
      status,
      agent_id,
      assigned_at,
      submitted_at,
      updated_at,
      created_at
    FROM patent_filings

    UNION ALL

    SELECT
      id,
      filing_type,
      COALESCE(payload->>'title', payload->>'trademarkName', payload->>'workTitle', payload->>'designTitle', 'N/A') AS title,
      reference_number,
      filing_identifier AS identifier,
      status,
      agent_id,
      assigned_at,
      submitted_at,
      updated_at,
      created_at
    FROM non_patent_filings
  `;

  const countSql = `
    SELECT COUNT(*)::int AS total_elements
    FROM (${baseCombined}) AS combined
    ${whereClause}
  `;

  const listSql = `
    SELECT *
    FROM (${baseCombined}) AS combined
    ${whereClause}
    ORDER BY ${DEFAULT_SORT}
    LIMIT $${index}
    OFFSET $${index + 1}
  `;

  return {
    countSql,
    listSql,
    values,
    paginationValues: [...values, query.size, offset],
  };
};

const listFilings = async ({ query }) => {
  const sql = buildListQuery({ query });

  const [countResult, listResult] = await Promise.all([
    db.query(sql.countSql, sql.values),
    db.query(sql.listSql, sql.paginationValues),
  ]);

  const totalElements = countResult.rows[0].total_elements;
  const totalPages = Math.ceil(totalElements / query.size) || 0;

  return {
    content: listResult.rows.map(normalizeFiling),
    pageable: {
      page: query.page,
      size: query.size,
      totalElements,
      totalPages,
    },
  };
};

const getAgentById = async (agentId) => {
  const result = await db.query(
    `
      SELECT id, name, email, role
      FROM users
      WHERE id = $1
    `,
    [agentId]
  );

  return result.rows[0] || null;
};

const updatePatentAssignment = async ({ filingId, agentId }) => {
  const result = await db.query(
    `
      UPDATE patent_filings
      SET agent_id = $2,
          assigned_at = NOW(),
          status = CASE
            WHEN status = 'PENDING' THEN 'ASSIGNED'
            ELSE status
          END,
          updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        'PATENT' AS filing_type,
        title,
        reference_number,
        patent_id AS identifier,
        status,
        agent_id,
        assigned_at,
        submitted_at,
        updated_at,
        created_at
    `,
    [filingId, agentId]
  );

  return result.rows[0] || null;
};

const updateNonPatentAssignment = async ({ filingId, agentId }) => {
  const result = await db.query(
    `
      UPDATE non_patent_filings
      SET agent_id = $2,
          assigned_at = NOW(),
          status = CASE
            WHEN status = 'PENDING' THEN 'ASSIGNED'
            ELSE status
          END,
          updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        filing_type,
        COALESCE(payload->>'title', payload->>'trademarkName', payload->>'workTitle', payload->>'designTitle', 'N/A') AS title,
        reference_number,
        filing_identifier AS identifier,
        status,
        agent_id,
        assigned_at,
        submitted_at,
        updated_at,
        created_at
    `,
    [filingId, agentId]
  );

  return result.rows[0] || null;
};

const assignAgentToFiling = async ({ filingId, agentId }) => {
  const agent = await getAgentById(agentId);

  if (!agent) {
    throw new ApiError(404, 'Agent not found', null, 'NOT_FOUND');
  }

  if (agent.role !== 'agent') {
    throw new ApiError(422, 'Selected user is not an agent', null, 'VALIDATION_ERROR');
  }

  const patentUpdated = await updatePatentAssignment({ filingId, agentId });
  if (patentUpdated) {
    return normalizeFiling(patentUpdated);
  }

  const nonPatentUpdated = await updateNonPatentAssignment({ filingId, agentId });
  if (nonPatentUpdated) {
    return normalizeFiling(nonPatentUpdated);
  }

  throw new ApiError(404, 'Filing not found', null, 'NOT_FOUND');
};

const setFilingDecision = async ({ filingId, status }) => {
  const patentUpdateResult = await db.query(
    `
      UPDATE patent_filings
      SET status = $2,
          updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        'PATENT' AS filing_type,
        title,
        reference_number,
        patent_id AS identifier,
        status,
        agent_id,
        assigned_at,
        submitted_at,
        updated_at,
        created_at
    `,
    [filingId, status]
  );

  if (patentUpdateResult.rows.length > 0) {
    return normalizeFiling(patentUpdateResult.rows[0]);
  }

  const nonPatentUpdateResult = await db.query(
    `
      UPDATE non_patent_filings
      SET status = $2,
          updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        filing_type,
        COALESCE(payload->>'title', payload->>'trademarkName', payload->>'workTitle', payload->>'designTitle', 'N/A') AS title,
        reference_number,
        filing_identifier AS identifier,
        status,
        agent_id,
        assigned_at,
        submitted_at,
        updated_at,
        created_at
    `,
    [filingId, status]
  );

  if (nonPatentUpdateResult.rows.length > 0) {
    return normalizeFiling(nonPatentUpdateResult.rows[0]);
  }

  throw new ApiError(404, 'Filing not found', null, 'NOT_FOUND');
};

const listAgents = async () => {
  const result = await db.query(
    `
      SELECT
        id,
        name,
        email,
        role
      FROM users
      WHERE role = 'agent'
      ORDER BY name ASC
    `
  );

  return result.rows;
};

module.exports = {
  listFilings,
  assignAgentToFiling,
  setFilingDecision,
  listAgents,
};
