require('dotenv').config({ path: require('path').join(__dirname, '../../.env') })
const { Pool } = require('pg')

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 5432,
  database: process.env.DB_NAME     || 'futur_command_center',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || ''
})

module.exports = pool
