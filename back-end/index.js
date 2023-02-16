const express = require('express');
var bodyParser = require('body-parser');
var sha256 = require('sha256');
var cors = require('cors')
var jwt = require('jsonwebtoken')
var fs = require('fs');
var moment = require('moment');

const { Client } = require('pg')

// Get private key file
var privateKey = fs.readFileSync('keys/jwtRS256.key');

// Connect to database
const client = new Client({
    user: 'postgres',
    host: 'localhost',
    database: 'Webpointment',
    password: '1234',
    port: 5432,
  })
client.connect()

// Start express, use cors, use bodyparser for JSON requests
const app = express()
app.use(cors())
app.use(bodyParser.json());


app.get('/', function (req, res) {
    let returnObj = {
        hello_world: "hello_world"
    }
    res.send(returnObj);
})

// Register
app.post('/register', async (req, res) => {
    const { first_name, last_name, email, password } = req.body;
    if (first_name && last_name && email && password) {
        encryptedPass = sha256(password);

        let text = "INSERT INTO users(user_first_name, user_last_name, user_email, user_password) VALUES($1, $2, $3, $4)";
        let values = [first_name, last_name, email, encryptedPass];

        try {
            await client.query(text, values);
            res.status(200).send({
                success: true,
                errorMessage: null
            });
        } catch (e) {
            console.log(e);
            if(e.code === '23505') {
                res.status(400).send({
                    success: false,
                    errorMessage: 'Email zaten mevcut.'
                });
            }
            res.status(500).send({
                success: false,
                errorMessage: 'Server error.'
            });
        }
    } else {
        res.status(400).send({
            success: false,
            errorMessage: 'Tüm alanlar zorunlu.'
        });
    }
})

// Login
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (email && password) {
        encryptedPass = sha256(password);

        let text = "SELECT * FROM users WHERE user_email = $1 AND user_password = $2";
        let values = [email, encryptedPass];
        try {
            let dbRes = await client.query(text, values);

            if (dbRes.rows.length === 1) {
                var sessionAccessToken = jwt.sign({ email }, { key: privateKey, passphrase: 'baa58da5c3dd1f69fae9' }, { algorithm: 'RS256'});
                text = "UPDATE users SET user_access_token = $1 WHERE user_email = $2";
                values = [sessionAccessToken, email];
                await client.query(text, values);
                res.status(200).send({
                    success: true,
                    errorMessage: null,
                    accessToken: sessionAccessToken,
                    name: dbRes.rows[0].user_first_name
                });
            } else {
                res.status(400).send({
                    success: false,
                    errorMessage: 'Email veya şifre yanlış.',
                    accessToken: null,
                    name: null
                });
            } 
        } catch (e) {
            console.log(e);
        }
    } else {
        res.status(400).send({
            success: false,
            errorMessage: 'Tüm alanlar zorunlu.',
            accessToken: null,
            name: null
        });
    }
})

// Appointment
app.post('/new_appointment', async (req, res) => {
    const {appointment_date, appointment_type, appointment_class, appointment_note } = req.body;

        
    if(moment().diff(moment(appointment_date), 'minutes') > 0) {
        res.status(400).send({
            success: false,
            errorMessage: "Randevunuz geçmişte."
        });
        return;
    }

    if(appointment_date && appointment_date < new Date()) {
        console.log('stmshmsd');
        return;
    }

    if (!(appointment_date && appointment_type && appointment_class)) {
        res.status(400).send({
            success: false,
            errorMessage: 'Tüm alanlar zorunlu.'
        });
        return;
    }
    if(req.headers.authorization) {
        let token = req.headers.authorization.split(' ')[1];
        let text = "SELECT * FROM users WHERE user_access_token = $1";
        let values = [token];
        let dbRes = await client.query(text, values);

        // User authorized
        if(dbRes.rows.length === 1) {
            // Check appointment date
            text = "select * from appointment_check($1);";
            values = [appointment_date];
            let appointmentCheckRes = await client.query(text, values);

            if(appointmentCheckRes.rows.length > 0) {
                res.status(400).send({
                    success: false,
                    errorMessage: "Bu saat aralığında zaten bir randevu var."
                });
                return;
            }

            // Insert appointment
            text = "INSERT INTO appointments(appointment_class_id, appointment_type_id, user_id, appointment_date, appointment_note) VALUES ($1, $2, $3, $4, $5);";
            values = [appointment_class, appointment_type, dbRes.rows[0].user_id, appointment_date, appointment_note];
            let appointmentRes = await client.query(text, values);
            res.status(200).send({
                success: true,
                errorMessage: null
            });
        } else {
            res.status(400).send({
                success: false,
                errorMessage: 'False token.'
            });
        }
    } 
    else {
        res.status(400).send({
            success: false,
            errorMessage: 'No token.'
        });
    }
})

// Get appointment
app.get('/appointment', async (req, res) => {
    if(req.headers.authorization) {
        let token = req.headers.authorization.split(' ')[1];
        let text = "SELECT * FROM users WHERE user_access_token = $1";
        let values = [token];
        let dbRes = await client.query(text, values);

        // User authorized
        if(dbRes.rows.length === 1) {
            // Check appointment date
            text = `SELECT 
                        "A".appointment_id,
                        "A".appointment_class_id,
                        "AC".appointment_class_name,
                        "A".appointment_type_id,
                        "AT".appointment_type_name,
                        "A".appointment_date,
                        "A".appointment_note
                        FROM appointments "A"
                        LEFT JOIN appointment_types "AT" on "A".appointment_type_id = "AT".appointment_type_id
                        LEFT JOIN appointment_classes "AC" on "A".appointment_class_id = "AC".appointment_class_id
                        WHERE user_id = $1`;
            values = [dbRes.rows[0].user_id];
            let appointmentList = await client.query(text, values);

            res.status(200).send({
                success: true,
                errorMessage: null,
                appointments: appointmentList.rows
            });
        } else {
            res.status(400).send({
                success: false,
                errorMessage: 'False token.'
            });
        }
    } 
    else {
        res.status(400).send({
            success: false,
            errorMessage: 'No token.'
        });
    }
})

app.listen(5000)