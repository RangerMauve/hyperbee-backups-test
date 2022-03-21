/*
Generate hyperbee, shove some data into it
Back it up
Save the keys
Clear the data on initial instance
Re-initialize the bee
Load data from the net
Try writing new data
Check it on both sides
*/

const crypto = require('crypto')
const test = require('tape')
const HyperBee = require('hyperbee')
const SDK = require('hyper-sdk')

test('Get backups working', async (t) => {
  const masterKey = crypto.randomBytes(32)
  const coreName = 'example'
  const mainOpts = {
    corestoreOpts: {
      masterKey
    },
    persist: false
  }
  let mainSDK = await SDK(mainOpts)
  const backupSDK = await SDK({ persist: false })
  try {
    const source = mainSDK.Hypercore(coreName)
    await source.ready()
    const { key } = source

    t.pass(`set up source hypercore ${key.toString('hex')}`)

    const bee1 = new HyperBee(source)

    await bee1.put('example', 'Hello World!')

    t.pass('added to hyperbee')

    const backup = backupSDK.Hypercore(key, { sparse: false })
    await backup.ready()

    t.pass('Initialized backup hypercore')

    if (!backup.peers.length) {
      await new Promise((resolve) => backup.once('peer-open', resolve))
    }

    t.pass(`Got connection, downloading ${backup.length}`)

    async function updateLoop () {
      await backup.update()
      t.pass(`Updated ${backup.length}`)
      updateLoop()
    }

    await updateLoop()

    await backup.download({ start: 0, end: backup.length })

    t.pass(`downloaded ${source.length} => ${backup.length}`)

    // All that data be gone
    await source.destroyStorage()
    await mainSDK.close()
    mainSDK = await SDK(mainOpts)

    t.pass('Destroyed original')

    const reloaded = mainSDK.Hypercore(coreName, {
      sparse: true,
      eagerUpdate: true
    })

    await reloaded.ready()

    // Needed so we can pull changes from the backup
    reloaded.setDownloading(true)

    t.pass('Initialized restored core')

    if (!reloaded.peers.length) {
      await new Promise((resolve) => reloaded.once('peer-open', resolve))
    }

    await reloaded.update()

    t.pass('Connected to backup, downloading')

    // Reload from the backup
    await reloaded.download({ start: 0, end: reloaded.length })

    t.pass('Downloaded')

    const bee2 = new HyperBee(reloaded)

    // We can read the existing data
    const {value: got} = await bee2.get(Buffer.from('example'))
    t.equal(got.toString('utf8'), 'Hello World!', 'Got data back out')

    // We can add data without forking the history
    await bee2.put('examplnt', 'Goodbye, world!')

    t.pass('Able to put into restored hyperbee')
  } finally {
    mainSDK.close()
    backupSDK.close()
  }
})
