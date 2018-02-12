const fs = require('fs')
const puppeteer = require('puppeteer')
const jsonfile = require('jsonfile')
const chalk = require('chalk')
const to = require('await-to-js').to
const base64 = require('base-64')
const utf8 = require('utf8')

const mongoose = require('mongoose');
const Store = require('./model')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// @format {String}
function base64zh(value, format) {
    if (format === 'e') {
        return base64.encode(utf8.encode(value))
    } else if (format === 'd') {
        return utf8.decode(base64.decode(value))
    } else {
        return value
    }
}

// connect mongodb
function connectMongo(excute) {
    mongoose.connect('mongodb://admin:785689@cluster0-shard-00-00-koeuy.mongodb.net:27017,cluster0-shard-00-01-koeuy.mongodb.net:27017,cluster0-shard-00-02-koeuy.mongodb.net:27017/test?ssl=true&replicaSet=Cluster0-shard-0&authSource=admin');

    const db = mongoose.connection;

    db.on('error', (msg) => {
        console.log('Error mesage')
        console.log(msg)
    })

    db.once('open', () => {
        console.log('Connected to MongoDB')
        excute()
        db.close()
    })
}



// 格式化时间
function getFormatTime() {
    const date = new Date()
    return `${date.toDateString()} ${date.toTimeString()}`
}
// 随机
function getRandomArbitrary(min, max) {
    return Math.random() * (max - min) + min;
}
// 查询是否存在
function findByNumber(number) {
    return new Promise((resolve, reject) => {
        Store.find({ number }, (err, docs) => {
            if (err) { reject(err) } else { resolve(docs) }
        })
    })
}

function save2Atlas(bson) {
    return new Promise((resolve, reject) => {
        findByNumber(bson.number)
            .then(docs => {
                if (docs.length) {
                    resolve('We owned this number')
                } else {
                    const item = new Store(bson)
                    item.save(err => {
                        if (!err) {
                            resolve('saved')
                        } else {
                            reject('failed')
                        }
                    })
                }
            })
            .catch(err => {
                reject(err)
            })
    })
}

function save2log(errlog) {
    fs.writeFileSync('./err.log', errlog, 'a')
}

async function filter(resources) {
    const tmp = []
    for (let i = 0; i < resources.length; i++) {
        const number = resources[i].number
        const doc = await findByNumber(number)
        if (!doc.length) {
            console.log(doc)
            tmp.push(resources[i])
        }
    }
    return tmp
}

function fetchUpdate() {
    console.log('excuted')
    const mainPrefix = base64.decode('aHR0cHM6Ly93d3cuamF2YnVzLnVzL3BhZ2U=')
    let count = 11
    let indexDB = []

    puppeteer.launch().then(async browser => {
        while (true) {
            const page = await browser.newPage();

            const [networkErr] = await to(page.goto(mainPrefix + '/' + count, {
                waitUntil: 'domcontentloaded'
            }))
            if (networkErr) {
                console.log(networkErr)
                console.log(chalk.yellow('network error'))
                continue
            }
            const [error, resources] = await to(page.evaluate(() => {
                const items = document.querySelectorAll('.movie-box')
                return [].map.call(items, ele => {
                    const info = ele.querySelector('img');
                    const date = ele.querySelectorAll('date')
                    return {
                        cover: info.getAttribute('src'),
                        title: info.getAttribute('title'),
                        number: date[0].innerHTML,
                        date: date[1].innerHTML
                    }
                })
            }))
            await page.close()
            if (!error && !resources.length) {
                break;
            }
            const newRes = await filter(resources)
            indexDB = indexDB.concat(newRes)
            console.log(count, newRes.length)
            if (newRes.length < 30) {
                break
            }
            count++
            await sleep(getRandomArbitrary(1, 5) * 1000)
        }
        let bson = {}
        indexDB.forEach((ele, index) => {
            bson[index] = ele
        })
        await browser.close()
        // jsonfile.writeFileSync('../json/updateThread.json', bson)
        db.close()
    })
}

function fetchByGenre(uri, index) {
    let count = 1
    let indexDB = []
    // process.on('exit', () => {
    //     console.log(chalk.gray(`You exit at ${count}`))
    // })
    return new Promise((resolve, reject) => {
        puppeteer.launch().then(async browser => {
            while (true) {
                const page = await browser.newPage();

                const [networkErr] = await to(page.goto(uri + '/' + count, {
                    waitUntil: 'domcontentloaded'
                }))
                if (networkErr) {
                    console.log(networkErr)
                    console.log(chalk.yellow('network error'))
                    continue
                }
                const [error, resources] = await to(page.evaluate(() => {
                    const items = document.querySelectorAll('.movie-box')
                    return [].map.call(items, ele => {
                        const info = ele.querySelector('img');
                        const date = ele.querySelectorAll('date')
                        return {
                            cover: info.getAttribute('src'),
                            title: info.getAttribute('title'),
                            number: date[0].innerHTML,
                            date: date[1].innerHTML
                        }
                    })
                }))
                await page.close()
                if (!error && !resources.length) {
                    break;
                }
                indexDB = indexDB.concat(resources)
                console.log(`${count} done`)
                count++
                await sleep(getRandomArbitrary(1, 5) * 1000)
            }
            let bson = {}
            indexDB.forEach((ele, index) => {
                bson[index] = ele
            })
            await browser.close()
            jsonfile.writeFileSync('../json/genre_' + index + '.json', bson)
            // db.close()
            resolve('DONE')
        })
    })

}

function saveDate() {
    let networkErrFlag = 0
    let start = 76;
    const bsonDB = jsonfile.readFileSync('../json/updateThread.json')
    const pool = Object.keys(bsonDB).map(index => bsonDB[index])
    const breakpoint = pool.length;
    console.log(pool.length)
    const bson = {}
    puppeteer.launch().then(async browser => {
        // console.log(pool)
        while (start < breakpoint) {
            const { number, cover } = pool[start]
            const uri = base64.decode('aHR0cHM6Ly93d3cuamF2YnVzLnVz') + '/' + number
            // console.log(uri)
            const page = await browser.newPage();
            const [networkErr] = await to(page.goto(uri, {
                waitUntil: 'networkidle0'
            }))
            if (networkErr) {
                console.log(chalk.yellow('Network Error'))
                networkErrFlag++
                if (networkErrFlag > 3) {
                    console.log(`${chalk.red(start)} is a shit, something is broken here`)
                    save2log(`${getFormatTime()}: ${number} is a shit, Network is broken here \n`)
                    networkErrFlag = 0
                    start++
                }
                continue
            }
            if (networkErrFlag) networkErrFlag = 0
            const html = await page.evaluate(() => {
                const infos = document.querySelector('.info')
                const mags = document.querySelector('#magnet-table')
                return {
                    info: infos.outerHTML,
                    magnet: mags.outerHTML
                }
            })
            await page.close()
            console.log(chalk.gray(start))
            /*save into mongodb atlas*/
            const [saveErr, saveSucc] = await to(save2Atlas(Object.assign({
                number,
                pic: cover,
            }, html)))
            if (saveErr) {
                console.log(saveErr)
                save2log(`${getFormatTime()}: ${saveErr};failed to insert data ${number}\n`)
            } else {
                console.log(saveSucc)
            }
            start++
            await sleep(getRandomArbitrary(1, 3) * 1000)
        }

        await browser.close()
        db.close()
    })
}

async function launch() {
    const index = 8
    const list = jsonfile.readFileSync('../json/genre.json')
    for (let i = index; i < 30; i++) {
        console.log(`Current genre ${i}`)
        if (list[i].tag === base64zh('5ZCM5oCn', 'd')) {
            continue
        }
        await fetchByGenre(list[i].uri, i)
    }
}

launch()

// fetchByGenre(list[index].uri, index)