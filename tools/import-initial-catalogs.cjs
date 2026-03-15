const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { Client } = require("pg");

const IMPORT_EFFECTIVE_DATE = "2026-03-14";
const IMPORT_SOURCE = "catalogos_excel_iniciales";

const FILES = {
  diasLaborales: "CAT DIAS LABORALES (PARA ASIGNACIONES).xlsx",
  empleados: "CAT EMPELADOS.xlsx",
  horariosSanPablo: "CAT HORARIOS SAN PABLO.xlsx",
  pdvs: "CAT PDV.xlsx",
  productos: "Catalogo_ISDIN_Nombres_Cortos.xlsx",
  misiones: "MISIONES_CON_NOMBRES_CORTOS.xlsx",
};

const ROLE_MAP = {
  administrador: "ADMINISTRADOR",
  coordinadora_dc: "COORDINADOR",
  dermoconsejo: "DERMOCONSEJERO",
  love_isdin: "LOVE_IS",
  nomina: "NOMINA",
  reclutamiento: "RECLUTAMIENTO",
  supervisor: "SUPERVISOR",
  ventas: "VENTAS",
};

const CHAIN_CATALOG = {
  benavides: { codigo: "BEN", factor: 1.2 },
  chedraui: { codigo: "CHE", factor: 1.2 },
  city_market: { codigo: "CIT", factor: 1.25 },
  el_palacio_de_hierro: { codigo: "PAL", factor: 1.5 },
  especializadas: { codigo: "ESP", factor: 1.0 },
  f_ahorro_derma: { codigo: "FAH", factor: 1.25 },
  fleming: { codigo: "FLE", factor: 1.1 },
  fragua: { codigo: "FRA", factor: 1.1 },
  fresko: { codigo: "FRK", factor: 1.25 },
  heb: { codigo: "HEB", factor: 1.25 },
  la_comer: { codigo: "LAC", factor: 1.25 },
  liverpool: { codigo: "LIV", factor: 1.5 },
  san_pablo: { codigo: "SAN", factor: 1.25 },
  sanapiel: { codigo: "SAP", factor: 1.1 },
  sanborns: { codigo: "SBN", factor: 1.15 },
  sears: { codigo: "SEA", factor: 1.15 },
  sephora: { codigo: "SEP", factor: 1.3 },
  soriana: { codigo: "SOR", factor: 1.2 },
};

function parseArgs(argv) {
  const parsed = { dbUrl: process.env.DATABASE_URL ?? null };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--db-url") {
      parsed.dbUrl = argv[index + 1] ?? null;
      index += 1;
    }
  }

  if (!parsed.dbUrl) {
    throw new Error("Falta --db-url o DATABASE_URL para conectar a Postgres.");
  }

  return parsed;
}

function stripDiacritics(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeHeaderKey(header) {
  return stripDiacritics(header)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeWhitespace(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > 0 ? text : null;
}

function normalizeUpperAscii(value) {
  const text = normalizeWhitespace(value);
  return text ? stripDiacritics(text).toUpperCase() : null;
}

function normalizeLowerEmail(value) {
  const text = normalizeWhitespace(value);
  return text ? text.toLowerCase() : null;
}

function normalizeUsername(value) {
  const text = normalizeWhitespace(value);
  return text ? text.toUpperCase() : null;
}

function normalizeNomina(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }

  const text = normalizeWhitespace(value);
  if (!text) {
    return null;
  }

  const normalized = text.replace(/\.0+$/, "");
  return normalized.length > 0 ? normalized : null;
}

function normalizeBooleanFlag(value) {
  return normalizeUpperAscii(value) === "SI";
}

function normalizePdvStatus(value) {
  return normalizeUpperAscii(value) === "NO" ? "INACTIVO" : "ACTIVO";
}

function parseExcelDate(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) {
      return null;
    }

    const month = String(parsed.m).padStart(2, "0");
    const day = String(parsed.d).padStart(2, "0");
    return `${parsed.y}-${month}-${day}`;
  }

  const text = normalizeWhitespace(value);
  if (!text) {
    return null;
  }

  const asDate = new Date(text);
  return Number.isNaN(asDate.getTime()) ? null : asDate.toISOString().slice(0, 10);
}

function parseCoordinates(value) {
  const text = normalizeWhitespace(value);
  if (!text) {
    return null;
  }

  const parts = text.split(",").map((item) => Number(item.trim()));
  if (parts.length !== 2 || parts.some((item) => !Number.isFinite(item))) {
    return null;
  }

  return {
    latitud: Number(parts[0].toFixed(7)),
    longitud: Number(parts[1].toFixed(7)),
  };
}

function parseInteger(value, fallback = null) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function clampInteger(value, min, max, fallback) {
  const parsed = parseInteger(value, fallback);
  if (parsed === null) {
    return fallback;
  }

  return Math.min(Math.max(parsed, min), max);
}

function parseTurnSchedule(rawValue) {
  const raw = normalizeWhitespace(rawValue);
  if (!raw) {
    return { horario: null, horaEntrada: null, horaSalida: null, tipo: "VACIO" };
  }

  const match = raw.match(/(\d{2}:\d{2})\s*a\s*(\d{2}:\d{2})/i);
  if (!match) {
    return {
      horario: raw,
      horaEntrada: null,
      horaSalida: null,
      tipo: "ESPECIAL",
    };
  }

  return {
    horario: raw,
    horaEntrada: match[1],
    horaSalida: match[2],
    tipo: "RANGO_HORARIO",
  };
}

function readSheetRows(filename) {
  const absolutePath = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`No existe el archivo requerido: ${absolutePath}`);
  }

  const workbook = XLSX.readFile(absolutePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null });

  return rawRows.map((row) => {
    const normalized = {};

    for (const [key, value] of Object.entries(row)) {
      const baseKey = normalizeHeaderKey(key);
      let candidate = baseKey || "columna";
      let suffix = 2;

      while (Object.prototype.hasOwnProperty.call(normalized, candidate)) {
        candidate = `${baseKey}_${suffix}`;
        suffix += 1;
      }

      normalized[candidate] = value;
    }

    return normalized;
  });
}

async function upsertCuentaClienteIsdin(client) {
  const result = await client.query(
    `
      insert into public.cuenta_cliente (identificador, nombre, activa, configuracion)
      values (
        'isdin_mexico',
        'ISDIN Mexico',
        true,
        '{"modo":"catalogo_inicial","portal_cliente":true,"timezone":"America/Mexico_City"}'::jsonb
      )
      on conflict (identificador) do update
      set
        nombre = excluded.nombre,
        activa = excluded.activa,
        configuracion = excluded.configuracion,
        updated_at = now()
      returning id
    `
  );

  return result.rows[0].id;
}

function getChainDefinition(rawName) {
  const key = normalizeHeaderKey(rawName);
  const definition = CHAIN_CATALOG[key];

  if (!definition) {
    throw new Error(`Cadena no mapeada en importador: ${rawName}`);
  }

  return definition;
}

async function upsertCadenas(client, pdvRows) {
  const uniqueChains = new Map();

  for (const row of pdvRows) {
    const rawName = normalizeWhitespace(row.cadena);
    if (rawName) {
      uniqueChains.set(normalizeHeaderKey(rawName), rawName);
    }
  }

  const chainIdByKey = new Map();

  for (const rawName of uniqueChains.values()) {
    const definition = getChainDefinition(rawName);
    const result = await client.query(
      `
        insert into public.cadena (codigo, nombre, factor_cuota_default, activa)
        values ($1, $2, $3, true)
        on conflict (codigo) do update
        set
          nombre = excluded.nombre,
          factor_cuota_default = excluded.factor_cuota_default,
          activa = excluded.activa,
          updated_at = now()
        returning id
      `,
      [definition.codigo, normalizeUpperAscii(rawName), definition.factor]
    );

    chainIdByKey.set(normalizeHeaderKey(rawName), result.rows[0].id);
  }

  return chainIdByKey;
}

async function upsertCiudades(client, pdvRows) {
  const uniqueCities = new Map();

  for (const row of pdvRows) {
    const nombre = normalizeUpperAscii(row.territorio);
    const zona = normalizeWhitespace(row.zona);

    if (nombre && zona) {
      uniqueCities.set(nombre, { nombre, zona });
    }
  }

  const cityIdByName = new Map();

  for (const city of uniqueCities.values()) {
    const result = await client.query(
      `
        insert into public.ciudad (nombre, zona, activa)
        values ($1, $2, true)
        on conflict (nombre) do update
        set
          zona = excluded.zona,
          activa = excluded.activa,
          updated_at = now()
        returning id
      `,
      [city.nombre, city.zona]
    );

    cityIdByName.set(city.nombre, result.rows[0].id);
  }

  return cityIdByName;
}

function buildEmployeeRecords(employeeRows, pdvRows) {
  const employees = [];
  const knownNominas = new Set();

  for (const row of employeeRows) {
    const idNomina = normalizeNomina(row.id_nomina);
    const puesto = ROLE_MAP[normalizeHeaderKey(row.rol)];

    if (!idNomina || !puesto) {
      continue;
    }

    knownNominas.add(idNomina);

    employees.push({
      idNomina,
      nombreCompleto: normalizeWhitespace(row.nombre),
      curp: normalizeUpperAscii(row.curp),
      nss: normalizeWhitespace(row.nss),
      rfc: normalizeUpperAscii(row.rfc),
      puesto,
      zona: null,
      telefono: normalizeWhitespace(row.telefono_celular),
      correoElectronico: normalizeLowerEmail(row.correo),
      estatusLaboral: "ACTIVO",
      fechaAlta: parseExcelDate(row.fecha_de_ingreso),
      fechaBaja: null,
      metadata: {
        fuente: IMPORT_SOURCE,
        archivo: FILES.empleados,
        usuario_inicial: normalizeUsername(row.usuario_inicial),
        fecha_nacimiento: parseExcelDate(row.fecha_de_nacimiento),
        domicilio_completo: normalizeWhitespace(row.domicilio_completo),
        codigo_postal: normalizeWhitespace(row.codigo_postal),
        edad: parseInteger(row.edad, null),
        anos_laborando: parseInteger(row.anos_laborando, null),
        sexo: normalizeWhitespace(row.sexo),
        estado_civil: normalizeWhitespace(row.estado_civil),
        originario: normalizeWhitespace(row.originario),
        sbc_diario: row.sbc_diario ?? null,
      },
      username: normalizeUsername(row.usuario_inicial),
    });
  }

  const supervisorStats = new Map();

  for (const row of pdvRows) {
    const idNomina = normalizeNomina(row.id_nomina_supervisor);
    if (!idNomina || knownNominas.has(idNomina)) {
      continue;
    }

    const current = supervisorStats.get(idNomina) ?? {
      nombreCompleto: normalizeWhitespace(row.supervisor_asignado),
      zonas: new Map(),
    };

    const zona = normalizeWhitespace(row.zona);
    if (zona) {
      current.zonas.set(zona, (current.zonas.get(zona) ?? 0) + 1);
    }

    supervisorStats.set(idNomina, current);
  }

  for (const [idNomina, info] of supervisorStats.entries()) {
    const zonaOrdenada = [...info.zonas.entries()].sort((left, right) => right[1] - left[1]);
    const zona = zonaOrdenada[0]?.[0] ?? null;

    employees.push({
      idNomina,
      nombreCompleto: info.nombreCompleto ?? `SUPERVISOR ${idNomina}`,
      curp: null,
      nss: null,
      rfc: null,
      puesto: "SUPERVISOR",
      zona,
      telefono: null,
      correoElectronico: null,
      estatusLaboral: "ACTIVO",
      fechaAlta: IMPORT_EFFECTIVE_DATE,
      fechaBaja: null,
      metadata: {
        fuente: IMPORT_SOURCE,
        archivo: FILES.pdvs,
        placeholder: true,
        origen_placeholder: "catalogo_pdv_sin_empleado_maestro",
      },
      username: null,
    });
  }

  return employees;
}

async function upsertEmpleados(client, employeeRecords) {
  const employeeIdByNomina = new Map();

  for (const employee of employeeRecords) {
    const result = await client.query(
      `
        insert into public.empleado (
          id_nomina,
          nombre_completo,
          curp,
          nss,
          rfc,
          puesto,
          zona,
          telefono,
          correo_electronico,
          estatus_laboral,
          fecha_alta,
          fecha_baja,
          supervisor_empleado_id,
          metadata
        )
        values (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, null, $13::jsonb
        )
        on conflict (id_nomina) do update
        set
          nombre_completo = excluded.nombre_completo,
          curp = excluded.curp,
          nss = excluded.nss,
          rfc = excluded.rfc,
          puesto = excluded.puesto,
          zona = excluded.zona,
          telefono = excluded.telefono,
          correo_electronico = excluded.correo_electronico,
          estatus_laboral = excluded.estatus_laboral,
          fecha_alta = excluded.fecha_alta,
          fecha_baja = excluded.fecha_baja,
          metadata = excluded.metadata,
          updated_at = now()
        returning id
      `,
      [
        employee.idNomina,
        employee.nombreCompleto,
        employee.curp,
        employee.nss,
        employee.rfc,
        employee.puesto,
        employee.zona,
        employee.telefono,
        employee.correoElectronico,
        employee.estatusLaboral,
        employee.fechaAlta,
        employee.fechaBaja,
        JSON.stringify(employee.metadata),
      ]
    );

    employeeIdByNomina.set(employee.idNomina, result.rows[0].id);
  }

  return employeeIdByNomina;
}

async function upsertUsuarios(client, employeeRecords, employeeIdByNomina) {
  let total = 0;

  for (const employee of employeeRecords) {
    if (!employee.username) {
      continue;
    }

    const empleadoId = employeeIdByNomina.get(employee.idNomina);
    if (!empleadoId) {
      continue;
    }

    const estadoCuenta = employee.correoElectronico
      ? "PENDIENTE_VERIFICACION_EMAIL"
      : "PROVISIONAL";

    await client.query(
      `
        insert into public.usuario (
          empleado_id,
          cuenta_cliente_id,
          username,
          estado_cuenta,
          correo_electronico,
          correo_verificado,
          password_temporal_generada_en,
          password_temporal_expira_en
        )
        values (
          $1,
          null,
          $2,
          $3,
          $4,
          false,
          now(),
          now() + interval '72 hours'
        )
        on conflict (username) do update
        set
          empleado_id = excluded.empleado_id,
          cuenta_cliente_id = excluded.cuenta_cliente_id,
          estado_cuenta = excluded.estado_cuenta,
          correo_electronico = excluded.correo_electronico,
          correo_verificado = excluded.correo_verificado,
          password_temporal_generada_en = excluded.password_temporal_generada_en,
          password_temporal_expira_en = excluded.password_temporal_expira_en,
          updated_at = now()
      `,
      [empleadoId, employee.username, estadoCuenta, employee.correoElectronico]
    );

    total += 1;
  }

  return total;
}

async function upsertProductos(client, productRows) {
  let total = 0;

  for (const row of productRows) {
    const sku = normalizeWhitespace(row.sky);
    const nombre = normalizeWhitespace(row.producto);
    const nombreCorto = normalizeWhitespace(row.nombre_corto);
    const categoria = normalizeUpperAscii(row.categoria);

    if (!sku || !nombre || !nombreCorto || !categoria) {
      continue;
    }

    await client.query(
      `
        insert into public.producto (
          sku,
          nombre,
          nombre_corto,
          categoria,
          top_30,
          activo,
          metadata
        )
        values ($1, $2, $3, $4, $5, true, $6::jsonb)
        on conflict (sku) do update
        set
          nombre = excluded.nombre,
          nombre_corto = excluded.nombre_corto,
          categoria = excluded.categoria,
          top_30 = excluded.top_30,
          activo = excluded.activo,
          metadata = excluded.metadata,
          updated_at = now()
      `,
      [
        sku,
        nombre,
        nombreCorto,
        categoria,
        normalizeBooleanFlag(row.top_30),
        JSON.stringify({ fuente: IMPORT_SOURCE, archivo: FILES.productos }),
      ]
    );

    total += 1;
  }

  return total;
}

async function syncMisiones(client, missionRows) {
  const missionCodes = [];
  let total = 0;
  let order = 1;

  await client.query(
    `
      update public.mision_dia
      set
        activa = false,
        updated_at = now()
      where codigo is null
    `
  );

  for (const row of missionRows) {
    const codigo = normalizeWhitespace(row.mision_id);
    const instruccion = normalizeWhitespace(row.mision);

    if (!codigo || !instruccion) {
      continue;
    }

    missionCodes.push(codigo);

    const updated = await client.query(
      `
        update public.mision_dia
        set
          instruccion = $2,
          activa = true,
          orden = $3,
          peso = $4,
          updated_at = now()
        where codigo = $1
      `,
      [codigo, instruccion, order, clampInteger(row.peso, 1, 99, 1)]
    );

    if (updated.rowCount === 0) {
      await client.query(
        `
          insert into public.mision_dia (codigo, instruccion, activa, orden, peso)
          values ($1, $2, true, $3, $4)
        `,
        [codigo, instruccion, order, clampInteger(row.peso, 1, 99, 1)]
      );
    }

    order += 1;
    total += 1;
  }

  await client.query(
    `
      update public.mision_dia
      set
        activa = false,
        updated_at = now()
      where codigo is not null
        and not (codigo = any($1::text[]))
    `,
    [missionCodes]
  );

  return total;
}

async function upsertPdvs(client, pdvRows, chainIdByKey, cityIdByName) {
  const pdvIdByClave = new Map();

  for (const row of pdvRows) {
    const claveBtl = normalizeWhitespace(row.codigo_btl);
    const cadenaRaw = normalizeWhitespace(row.cadena);
    const cityName = normalizeUpperAscii(row.territorio);

    if (!claveBtl || !cadenaRaw || !cityName) {
      continue;
    }

    const cadenaId = chainIdByKey.get(normalizeHeaderKey(cadenaRaw));
    const ciudadId = cityIdByName.get(cityName);

    if (!cadenaId || !ciudadId) {
      throw new Error(`No fue posible resolver cadena/ciudad para PDV ${claveBtl}`);
    }

    const result = await client.query(
      `
        insert into public.pdv (
          clave_btl,
          cadena_id,
          ciudad_id,
          id_cadena,
          nombre,
          direccion,
          zona,
          formato,
          horario_entrada,
          horario_salida,
          estatus,
          metadata
        )
        values (
          $1, $2, $3, $4, $5, $6, $7, $8, null, null, $9, $10::jsonb
        )
        on conflict (clave_btl) do update
        set
          cadena_id = excluded.cadena_id,
          ciudad_id = excluded.ciudad_id,
          id_cadena = excluded.id_cadena,
          nombre = excluded.nombre,
          direccion = excluded.direccion,
          zona = excluded.zona,
          formato = excluded.formato,
          horario_entrada = excluded.horario_entrada,
          horario_salida = excluded.horario_salida,
          estatus = excluded.estatus,
          metadata = excluded.metadata,
          updated_at = now()
        returning id
      `,
      [
        claveBtl,
        cadenaId,
        ciudadId,
        normalizeWhitespace(row.id_pdv_externo),
        normalizeWhitespace(row.nombre_corto) ?? normalizeWhitespace(row.sucursal) ?? claveBtl,
        normalizeWhitespace(row.direccion),
        normalizeWhitespace(row.zona),
        normalizeWhitespace(row.sucursal),
        normalizePdvStatus(row.activo),
        JSON.stringify({
          fuente: IMPORT_SOURCE,
          archivo: FILES.pdvs,
          cadena_fuente: cadenaRaw,
          entidad_federativa: normalizeWhitespace(row.entidad_federativa),
          territorio: normalizeWhitespace(row.territorio),
          geocerca_metros_fuente: clampInteger(row.geocerca_m, 1, 1000, 100),
          tolerancia_minutos_fuente: clampInteger(row.tolerancia_min, 0, 240, 0),
          supervisor_asignado_fuente: normalizeWhitespace(row.supervisor_asignado),
          id_nomina_supervisor_fuente: normalizeNomina(row.id_nomina_supervisor),
          estado_catalogo_fuente: normalizeWhitespace(row.activo),
        }),
      ]
    );

    pdvIdByClave.set(claveBtl, result.rows[0].id);
  }

  return pdvIdByClave;
}

async function upsertGeocercas(client, pdvRows, pdvIdByClave) {
  let total = 0;

  for (const row of pdvRows) {
    const claveBtl = normalizeWhitespace(row.codigo_btl);
    const pdvId = claveBtl ? pdvIdByClave.get(claveBtl) : null;
    const coordinates = parseCoordinates(row.coordenadas);

    if (!pdvId || !coordinates) {
      continue;
    }

    await client.query(
      `
        insert into public.geocerca_pdv (
          pdv_id,
          latitud,
          longitud,
          radio_tolerancia_metros,
          permite_checkin_con_justificacion
        )
        values ($1, $2, $3, $4, true)
        on conflict (pdv_id) do update
        set
          latitud = excluded.latitud,
          longitud = excluded.longitud,
          radio_tolerancia_metros = excluded.radio_tolerancia_metros,
          permite_checkin_con_justificacion = excluded.permite_checkin_con_justificacion,
          updated_at = now()
      `,
      [
        pdvId,
        coordinates.latitud,
        coordinates.longitud,
        clampInteger(row.geocerca_m, 1, 1000, 100),
      ]
    );

    total += 1;
  }

  return total;
}

async function syncSupervisorAssignments(client, pdvRows, pdvIdByClave, employeeIdByNomina) {
  let total = 0;

  for (const row of pdvRows) {
    const claveBtl = normalizeWhitespace(row.codigo_btl);
    const supervisorNomina = normalizeNomina(row.id_nomina_supervisor);
    const pdvId = claveBtl ? pdvIdByClave.get(claveBtl) : null;
    const empleadoId = supervisorNomina ? employeeIdByNomina.get(supervisorNomina) : null;

    if (!pdvId || !empleadoId) {
      continue;
    }

    await client.query(
      `
        update public.supervisor_pdv
        set
          activo = false,
          fecha_fin = $2,
          updated_at = now()
        where pdv_id = $1
          and activo = true
          and fecha_fin is null
          and empleado_id <> $3
      `,
      [pdvId, IMPORT_EFFECTIVE_DATE, empleadoId]
    );

    await client.query(
      `
        insert into public.supervisor_pdv (
          pdv_id,
          empleado_id,
          activo,
          fecha_inicio,
          fecha_fin
        )
        values ($1, $2, true, $3, null)
        on conflict (pdv_id, empleado_id, fecha_inicio) do update
        set
          activo = excluded.activo,
          fecha_fin = excluded.fecha_fin,
          updated_at = now()
      `,
      [pdvId, empleadoId, IMPORT_EFFECTIVE_DATE]
    );

    total += 1;
  }

  return total;
}

async function syncCuentaClientePdvs(client, pdvIdByClave, cuentaClienteId) {
  let total = 0;

  for (const pdvId of pdvIdByClave.values()) {
    await client.query(
      `
        update public.cuenta_cliente_pdv
        set
          activo = false,
          fecha_fin = $2,
          updated_at = now()
        where pdv_id = $1
          and activo = true
          and fecha_fin is null
          and cuenta_cliente_id <> $3
      `,
      [pdvId, IMPORT_EFFECTIVE_DATE, cuentaClienteId]
    );

    await client.query(
      `
        insert into public.cuenta_cliente_pdv (
          cuenta_cliente_id,
          pdv_id,
          activo,
          fecha_inicio,
          fecha_fin
        )
        values ($1, $2, true, $3, null)
        on conflict (cuenta_cliente_id, pdv_id, fecha_inicio) do update
        set
          activo = excluded.activo,
          fecha_fin = excluded.fecha_fin,
          updated_at = now()
      `,
      [cuentaClienteId, pdvId, IMPORT_EFFECTIVE_DATE]
    );

    total += 1;
  }

  return total;
}

async function upsertConfiguracionCatalogos(client, daysRows, shiftRows, summary) {
  const daysCatalog = {
    fuente: FILES.diasLaborales,
    actualizado_en: IMPORT_EFFECTIVE_DATE,
    patrones: daysRows
      .map((row) => ({
        etiqueta: normalizeWhitespace(row.dias),
        abreviatura: normalizeWhitespace(row.nom),
      }))
      .filter((row) => row.etiqueta && row.abreviatura),
    dias_semana: daysRows
      .map((row) => ({
        nombre: normalizeWhitespace(row.dias_2),
        clave: normalizeWhitespace(row.nom_1),
      }))
      .filter((row) => row.nombre && row.clave),
  };

  const shiftsCatalog = {
    fuente: FILES.horariosSanPablo,
    actualizado_en: IMPORT_EFFECTIVE_DATE,
    turnos: shiftRows
      .map((row) => {
        const parsed = parseTurnSchedule(row.horario);
        return {
          nomenclatura: normalizeWhitespace(row.nomenclatura),
          turno: normalizeWhitespace(row.turno),
          horario: parsed.horario,
          hora_entrada: parsed.horaEntrada,
          hora_salida: parsed.horaSalida,
          tipo: parsed.tipo,
        };
      })
      .filter((row) => row.nomenclatura),
  };

  const importSummary = {
    fuente: IMPORT_SOURCE,
    fecha_efectiva: IMPORT_EFFECTIVE_DATE,
    archivos: FILES,
    conteos: summary,
  };

  const entries = [
    {
      clave: "asignaciones.catalogo_dias_laborales",
      modulo: "asignaciones",
      descripcion: "Catalogo base de patrones de dias laborales cargado desde Excel operativo.",
      valor: daysCatalog,
    },
    {
      clave: "asistencias.san_pablo.catalogo_turnos",
      modulo: "asistencias",
      descripcion: "Catalogo de nomenclaturas y horarios base de SAN PABLO cargado desde Excel operativo.",
      valor: shiftsCatalog,
    },
    {
      clave: "catalogos.carga_inicial.resumen",
      modulo: "configuracion",
      descripcion: "Resumen de la ultima sincronizacion de catalogos operativos iniciales.",
      valor: importSummary,
    },
  ];

  for (const entry of entries) {
    await client.query(
      `
        insert into public.configuracion (clave, valor, descripcion, modulo)
        values ($1, $2::jsonb, $3, $4)
        on conflict (clave) do update
        set
          valor = excluded.valor,
          descripcion = excluded.descripcion,
          modulo = excluded.modulo,
          updated_at = now()
      `,
      [entry.clave, JSON.stringify(entry.valor), entry.descripcion, entry.modulo]
    );
  }
}

async function collectSummary(client) {
  const result = await client.query(`
    select 'empleado' as tabla, count(*)::int as total from public.empleado
    union all
    select 'usuario' as tabla, count(*)::int as total from public.usuario
    union all
    select 'pdv' as tabla, count(*)::int as total from public.pdv
    union all
    select 'geocerca_pdv' as tabla, count(*)::int as total from public.geocerca_pdv
    union all
    select 'supervisor_pdv_activo' as tabla, count(*)::int as total from public.supervisor_pdv where activo = true and fecha_fin is null
    union all
    select 'cuenta_cliente_pdv_activo' as tabla, count(*)::int as total from public.cuenta_cliente_pdv where activo = true and fecha_fin is null
    union all
    select 'producto' as tabla, count(*)::int as total from public.producto
    union all
    select 'mision_dia_activa' as tabla, count(*)::int as total from public.mision_dia where activa = true
    union all
    select 'configuracion' as tabla, count(*)::int as total from public.configuracion
  `);

  return Object.fromEntries(result.rows.map((row) => [row.tabla, row.total]));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const daysRows = readSheetRows(FILES.diasLaborales);
  const employeeRows = readSheetRows(FILES.empleados);
  const shiftRows = readSheetRows(FILES.horariosSanPablo);
  const pdvRows = readSheetRows(FILES.pdvs);
  const productRows = readSheetRows(FILES.productos);
  const missionRows = readSheetRows(FILES.misiones);

  const client = new Client({
    connectionString: args.dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    await client.query("begin");

    const cuentaClienteId = await upsertCuentaClienteIsdin(client);
    const chainIdByKey = await upsertCadenas(client, pdvRows);
    const cityIdByName = await upsertCiudades(client, pdvRows);
    const employeeRecords = buildEmployeeRecords(employeeRows, pdvRows);
    const employeeIdByNomina = await upsertEmpleados(client, employeeRecords);
    const totalUsuarios = await upsertUsuarios(client, employeeRecords, employeeIdByNomina);
    const totalProductos = await upsertProductos(client, productRows);
    const totalMisiones = await syncMisiones(client, missionRows);
    const pdvIdByClave = await upsertPdvs(client, pdvRows, chainIdByKey, cityIdByName);
    const totalGeocercas = await upsertGeocercas(client, pdvRows, pdvIdByClave);
    const totalSupervisiones = await syncSupervisorAssignments(
      client,
      pdvRows,
      pdvIdByClave,
      employeeIdByNomina
    );
    const totalCuentaClientePdvs = await syncCuentaClientePdvs(
      client,
      pdvIdByClave,
      cuentaClienteId
    );

    const importSummary = {
      empleados_catalogo: employeeRows.length,
      empleados_upsertados: employeeRecords.length,
      usuarios_upsertados: totalUsuarios,
      pdvs_upsertados: pdvIdByClave.size,
      geocercas_upsertadas: totalGeocercas,
      supervisiones_activas_sincronizadas: totalSupervisiones,
      cuenta_cliente_pdvs_sincronizados: totalCuentaClientePdvs,
      productos_upsertados: totalProductos,
      misiones_activas_sincronizadas: totalMisiones,
      catalogo_turnos: shiftRows.length,
      catalogo_dias: daysRows.length,
    };

    await upsertConfiguracionCatalogos(client, daysRows, shiftRows, importSummary);
    await client.query("commit");

    const dbSummary = await collectSummary(client);
    console.log(
      JSON.stringify(
        {
          importacion: importSummary,
          base: dbSummary,
        },
        null,
        2
      )
    );
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

