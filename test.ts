import { MongoClient } from 'mongodb'
import moment = require('moment');
const HASH_MAPPING = {
    'tractor|flatbed|large|tandem': '5DyPevI7',
    'tractor|||single': '6rOuWuiR',
    'tractor|||tandem': '5DyPevI7',
    'tractor|||tandemsleeper': '4jU4r6R7',
    'tractor|||single-axle-sleeper': '5b8NpFEL',
    'trailer|dry|large|': '3z1w9pvF',
    'trailer|dry|small|': 'x4yu2FKV',
    'trailer|flatbed|large|': '4Mv3IOO2',
    'trailer|flatbed|small|': '1wHbswsx',
    'trailer|flatbed|small|single': '1wHbswsx',
    'trailer|flatbed|small|tandem': '1wHbswsx',
    'trailer|flatbed|van|': 'SMkwduJL',
    'trailer|reefer|large|': '5cSwmEOy',
    'trailer|reefer|small|': '3jGyyDat',
    'trailer|reefer|small|tandem': '3jGyyDat',
    'truck|dry|large|': '6fCmDub7',
    'truck|dry|small|': '1mjiQs8R',
    'truck|dry|van|': 'cedo8tKO',
    'truck|flatbed|large|': '6JIZxb7x',
    'truck|flatbed|small|': '424Xtthx',
    'truck|flatbed|van|': '2Fvi7eE3',
    'truck|reefer|large|': '696aUQWQ',
    'truck|reefer|small|': '2RPA4oH3',
    'truck|reefer|small|single': '2RPA4oH3',
    'truck|reefer|van|': '5R0u3MOp',
}

const MONGO_URI = 'mongodb://127.0.0.1:27017/tcoop_db_stage'

const client = new MongoClient(MONGO_URI);
const mongo = client.db('tcoop_db_stage')

function computeHash(vehicle) {
    const hashPropertyNames = ['assetType', 'size', 'axleType', 'bodyType']
    const key = hashPropertyNames.map((prop) => vehicle[prop]).join('|')
    return HASH_MAPPING[key]
}

function getVehicleAge(vehicleYear: number) {
    if (!vehicleYear || vehicleYear > moment().year()) {
        return 0
    }
    return moment().diff(vehicleYear.toString(), 'years', false)
}

async function fetchOneVehicle() {
    return mongo.collection('vehicles').findOne({
    }, {
        sort: {
            createdAt: -1
        }
    })
}

async function testDayrates() {
    const tierDayRateDGraph = await mongo.collection('dgraphs').findOne({
        namespace: 'tier-day-rate',
        name: 'default',
    }, {
        sort: {
            version: -1
        }
    })

    const resDayRateBaseGraph = await mongo.collection('dgraphs').findOne({
        namespace: 'res-dayrates-base',
        name: 'default',
    }, {
        sort: {
            version: -1
        }
    })

    const vehicle = await fetchOneVehicle()

    const tierDayRateDGraphInputs = {
        vehiclePropsHash: computeHash(vehicle),
        vehicleAssetType: vehicle.assetType,
        vehicleSize: vehicle.size,
        vehicleAge: getVehicleAge(vehicle.details.year),
        // pricingTier,
    }
    console.log(tierDayRateDGraphInputs)
}

async function run() {
    // Establish and verify connection
    await client.connect();
    await client.db("admin").command({ ping: 1 });

    await testDayrates()

    await client.close()
}

run()