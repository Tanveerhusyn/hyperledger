'use strict';
const express = require('express');


const app = express();
var cors = require('cors');
app.use(cors())

// const {Gateway,Wallets  } = require('fabric-network');
// const path = require('path');
// const ccpPath = path.resolve(__dirname, '..', '..', 'test-network', 'organizations', 'peerOrganizations', 'org1.example.com', 'connection-org1.json');
// const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));


const FabricCAServices = require('fabric-ca-client');

const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');
const { Wallets, Gateway } = require('fabric-network');
const CommercialPaper = require('../contract/lib/paper.js');
const { json } = require('body-parser');


// const ccpPath = path.resolve(__dirname, '..', '..', 'first-network', 'connection-org1.json');

// CORS Origin
app.use(function (req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', true);
    next();
});

app.use(express.json());

app.post('/registerUserOrg2',async (req,res)=>{
    try {
        // load the network configuration
        let connectionProfile = yaml.safeLoad(fs.readFileSync('../../gateway/connection-org2.yaml', 'utf8'));

        // Create a new CA client for interacting with the CA.
        const caInfo = connectionProfile.certificateAuthorities['ca.org2.example.com'];
        const caTLSCACerts = caInfo.tlsCACerts.pem;
        const ca = new FabricCAServices(caInfo.url, { trustedRoots: caTLSCACerts, verify: false }, caInfo.caName);

        // Create a new file system based wallet for managing identities.
        const walletPath = path.join(process.cwd(), '../../identity/user/isabella/wallet');
        const wallet = await Wallets.newFileSystemWallet(walletPath);
        console.log(`Wallet path: ${walletPath}`);

        // Check to see if we've already enrolled the admin user.
        const userExists = await wallet.get(req.body.username);
        if (userExists) {
            console.log('An identity for the client user "user1" already exists in the wallet');
            return;
        }

        // Enroll the admin user, and import the new identity into the wallet.
        const enrollment = await ca.enroll({ enrollmentID: 'user1', enrollmentSecret: 'user1pw' });
        const x509Identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes(),
            },
            mspId: 'Org2MSP',
            type: 'X.509',
        };
        await wallet.put(req.body.username, x509Identity);
        console.log();
        res.json({status: true, message: {message: 'Successfully enrolled client user and imported it into the wallet'}});
        

    } catch (error) {
        res.json({error:`Failed to enroll client user : ${error}`});
        process.exit(1);
    }


});


app.post('/registerUserOrg1',async (req,res)=>{
    try {
        // load the network configuration
        let connectionProfile = yaml.safeLoad(fs.readFileSync('../../gateway/connection-org1.yaml', 'utf8'));

        // Create a new CA client for interacting with the CA.
        const caInfo = connectionProfile.certificateAuthorities['ca.org1.example.com'];
        const caTLSCACerts = caInfo.tlsCACerts.pem;
        const ca = new FabricCAServices(caInfo.url, { trustedRoots: caTLSCACerts, verify: false }, caInfo.caName);

        // Create a new file system based wallet for managing identities.
        const walletPath = path.join(process.cwd(), '../../identity/user/balaji/wallet');
        const wallet = await Wallets.newFileSystemWallet(walletPath);
        console.log(`Wallet path: ${walletPath}`);

        // Check to see if we've already enrolled the admin user.
        const userExists = await wallet.get(req.body.username);
        if (userExists) {
            res.json('An identity for the client user already exists in the wallet');
            return;
        }

        // Enroll the admin user, and import the new identity into the wallet.
        const enrollment = await ca.enroll({ enrollmentID: 'user1', enrollmentSecret: 'user1pw' });
        const x509Identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes(),
            },
            mspId: 'Org1MSP',
            type: 'X.509',
        };
        await wallet.put(req.body.username, x509Identity);
        
        res.json({status: true, message: {message: 'Successfully enrolled client user and imported it into the wallet'}});

    } catch (error) {
        console.error(`Failed to enroll client user "balaji": ${error}`);
        res.json({status: false, error: {message: 'Failed to enroll client user'}});

        process.exit(1);
    }


});
let finished;
app.get('/blocks' ,async (req,res)=>{
    
    try {
        // Set up the wallet - just use Org2's wallet (isabella)
	const wallet = await Wallets.newFileSystemWallet('../../identity/user/isabella/wallet');

        // Create a new gateway for connecting to our peer node.
        const gateway = new Gateway();
        
        const userName = 'isabella';

        // Load connection profile; will be used to locate a gateway
        let connectionProfile = yaml.safeLoad(fs.readFileSync('../../gateway/connection-org2.yaml', 'utf8'));

        // Set connection options; identity and wallet
        let connectionOptions = {
            identity: userName,
            wallet: wallet,
            discovery: { enabled:true, asLocalhost: true }
        };

        // connect to the gateway
        await gateway.connect(connectionProfile, connectionOptions);
        // get the channel and smart contract
        const network = await gateway.getNetwork('mychannel');

        // Listen for blocks being added, display relevant contents: in particular, the transaction inputs
        finished = false;
        
        const listener = async (event) => {
            if (event.blockData !== undefined) {
                for (const i in event.blockData.data.data) {
                    if (event.blockData.data.data[i].payload.data.actions !== undefined) {
                        const inputArgs = event.blockData.data.data[i].payload.data.actions[0].payload.chaincode_proposal_payload.input.chaincode_spec.input.args;
                        // Print block details
                        console.log('----------');
                        console.log('Block:', parseInt(event.blockData.header.number), 'transaction', i);
                        // Show ID and timestamp of the transaction
                        const tx_id = event.blockData.data.data[i].payload.header.channel_header.tx_id;
                        const txTime = new Date(event.blockData.data.data[i].payload.header.channel_header.timestamp).toUTCString();
                        // Show ID, date and time of transaction
                        console.log('Transaction ID:', tx_id);
                        console.log('Timestamp:', txTime);
                        res.json({status:true,transaction:{ID:tx_id,timestamp:txTime}})
                        // Show transaction inputs (formatted, as may contain binary data)
                        let inputData = 'Inputs: ';
                        for (let j = 0; j < inputArgs.length; j++) {
                            const inputArgPrintable = inputArgs[j].toString().replace(/[^\x20-\x7E]+/g, '');
                            inputData = inputData.concat(inputArgPrintable, ' ');
                        }
                        console.log(inputData);
                        res.json({inputData:inputData})
                        // Show the proposed writes to the world state
                        let keyData = 'Keys updated: ';
                        for (const l in event.blockData.data.data[i].payload.data.actions[0].payload.action.proposal_response_payload.extension.results.ns_rwset[1].rwset.writes) {
                            // add a ' ' space between multiple keys in 'concat'
                            keyData = keyData.concat(event.blockData.data.data[i].payload.data.actions[0].payload.action.proposal_response_payload.extension.results.ns_rwset[1].rwset.writes[l].key, ' ');
                        }
                        console.log(keyData);
                        res.json({keyData:keyData})
                        // Show which organizations endorsed
                        let endorsers = 'Endorsers: ';
                        for (const k in event.blockData.data.data[i].payload.data.actions[0].payload.action.endorsements) {
                            endorsers = endorsers.concat(event.blockData.data.data[i].payload.data.actions[0].payload.action.endorsements[k].endorser.mspid, ' ');
                        }
                        console.log(endorsers);
                        res.json({endorser:endorsers})
                        // Was the transaction valid or not?
                        // (Invalid transactions are still logged on the blockchain but don't affect the world state)
                        if ((event.blockData.metadata.metadata[2])[i] !== 0) {
                            console.log('INVALID TRANSACTION');
                            res.json({status:false, error:'INVALID TRANSACTION'})
                        }
                    }
                }
            }
        };
        const options = {
            type: 'full',
            startBlock: 1
        };
        await network.addBlockListener(listener, options);
        while (!finished) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            // Disconnect from the gateway after Promise is resolved.
            // ... do other things
        }
        gateway.disconnect();
    }
    catch (error) {
        console.error('Error: ', error);
        res.json({error:error})
        process.exit(1);
    }
});

app.post('/newland',async (req,res) =>{
    // A wallet stores a collection of identities for use
    const wallet = await Wallets.newFileSystemWallet('../../identity/user/isabella/wallet');

    // A gateway defines the peers used to access Fabric networks
    const gateway = new Gateway();

    // Main try/catch block
    try {

        // Specify userName for network access
        // const userName = 'isabella.issuer@magnetocorp.com';
        const userName = 'isabella';

        // Load connection profile; will be used to locate a gateway
        let connectionProfile = yaml.safeLoad(fs.readFileSync('../../gateway/connection-org2.yaml', 'utf8'));

        // Set connection options; identity and wallet
        let connectionOptions = {
            identity: userName,
            wallet: wallet,
            discovery: { enabled:true, asLocalhost: true }
        };

        // Connect to gateway using application specified parameters
        console.log('Connect to Fabric gateway.');

        await gateway.connect(connectionProfile, connectionOptions);

        // Access PaperNet network
        console.log('Use network channel: mychannel.');

        const network = await gateway.getNetwork('mychannel');

        // Get addressability to commercial paper contract
        console.log('Use org.papernet.commercialpaper smart contract.');

        const contract = await network.getContract('papercontract');

        // issue commercial paper
        console.log('Submit commercial paper issue transaction.');

        const issueResponse = await contract.submitTransaction('issue', req.body.issuer, req.body.landNumber, req.body.issuetime, '2020-11-30', req.body.price);

        // process response
        let paper = CommercialPaper.fromBuffer(issueResponse);


        res.json({status:true,message:paper});

        // let paper = CommercialPaper.fromBuffer(issueResponse);

        // console.log(`${paper.issuer} commercial paper : ${paper.paperNumber} successfully issued for value ${paper.faceValue}`);
        // console.log('Transaction complete.');

    } catch (error) {

        res.json({error:`Error processing transaction. ${error}`});
        

    } finally {

        // Disconnect from the gateway
        console.log('Disconnect from Fabric gateway.');
        gateway.disconnect();

    }
});


app.post('/buy',async (req,res)=>{
    // A wallet stores a collection of identities for use
    const wallet = await Wallets.newFileSystemWallet('../../identity/user/balaji/wallet');


    // A gateway defines the peers used to access Fabric networks
    const gateway = new Gateway();

    // Main try/catch block
    try {

        // Specify userName for network access
        const userName = 'balaji';

        // Load connection profile; will be used to locate a gateway
        let connectionProfile = yaml.safeLoad(fs.readFileSync('../../gateway/connection-org1.yaml', 'utf8'));

        // Set connection options; identity and wallet
        let connectionOptions = {
            identity: userName,
            wallet: wallet,
            discovery: { enabled: true, asLocalhost: true }

        };

        // Connect to gateway using application specified parameters
        console.log('Connect to Fabric gateway.');

        await gateway.connect(connectionProfile, connectionOptions);

        // Access PaperNet network
        console.log('Use network channel: mychannel.');

        const network = await gateway.getNetwork('mychannel');

        // Get addressability to commercial paper contract
        console.log('Use org.papernet.commercialpaper smart contract.');

        const contract = await network.getContract('papercontract', 'org.papernet.commercialpaper');

        // buy commercial paper
        console.log('Submit commercial paper buy transaction.');
        
	console.log(req.body);
        const buyResponse = await contract.submitTransaction('buy', req.body.issuer, req.body.landNumber,req.body.currentOwner,req.body.newOwner, req.body.price,req.body.date);

        // process response
        console.log('Process buy transaction response.');

        let paper = CommercialPaper.fromBuffer(buyResponse);

        console.log(`${paper.issuer} commercial paper : ${paper.paperNumber} successfully purchased by ${paper.owner}`);
        console.log('Transaction complete.');

        res.json({status:true, data:{paper},message:'Transaction complete'})

    } catch (error) {

       res.json({error:`Error processing transaction. ${error}`});
        console.log(error.stack);

    } finally {

        // Disconnect from the gateway
        console.log('Disconnect from Fabric gateway.');
        gateway.disconnect();

    }
});


app.post('/queryHistory',async(req,res)=>{
 // A wallet stores a collection of identities for use
     const wallet = await Wallets.newFileSystemWallet('../../identity/user/balaji/wallet');


     // A gateway defines the peers used to access Fabric networks
     const gateway = new Gateway();
 
     // Main try/catch block
     try {
 
         // Specify userName for network access
         const userName = 'balaji';
 
         // Load connection profile; will be used to locate a gateway
         let connectionProfile = yaml.safeLoad(fs.readFileSync('../../gateway/connection-org1.yaml', 'utf8'));
 
         // Set connection options; identity and wallet
         let connectionOptions = {
             identity: userName,
             wallet: wallet,
             discovery: { enabled: true, asLocalhost: true }
 
         };
 
         // Connect to gateway using application specified parameters
         console.log('Connect to Fabric gateway.');
 
         await gateway.connect(connectionProfile, connectionOptions);
 
         // Access PaperNet network
         console.log('Use network channel: mychannel.');
 
         const network = await gateway.getNetwork('mychannel');
 
         // Get addressability to commercial paper contract
         console.log('Use org.papernet.commercialpaper smart contract.');
 
         const contract = await network.getContract('papercontract', 'org.papernet.commercialpaper');
 
         // queries - commercial paper
         console.log('-----------------------------------------------------------------------------------------');
         console.log('****** Submitting commercial paper queries ****** \n\n ');
 
 
         // 1 asset history
         console.log('1. Query Commercial Paper History....');
         console.log('-----------------------------------------------------------------------------------------\n');
          let queryResponse = await contract.evaluateTransaction('queryHistory', req.body.owner, req.body.landNumber);

        let json = JSON.parse(queryResponse.toString());
       
         console.log(json);
         res.json({data:json});
        
         console.log('\n  Named query by "value" complete.');
         console.log('-----------------------------------------------------------------------------------------\n\n');
     } catch (error) {
 
         console.log(`Error processing transaction. ${error}`);
         console.log(error.stack);
 
     } finally {
 
         // Disconnect from the gateway
         console.log('Disconnect from Fabric gateway.');
         gateway.disconnect();
 
     }




});

app.post('/queryall',async(req,res)=>{
     // A wallet stores a collection of identities for use
     const wallet = await Wallets.newFileSystemWallet('../../identity/user/balaji/wallet');


     // A gateway defines the peers used to access Fabric networks
     const gateway = new Gateway();
 
     // Main try/catch block
     try {
 
         // Specify userName for network access
         const userName = 'balaji';
 
         // Load connection profile; will be used to locate a gateway
         let connectionProfile = yaml.safeLoad(fs.readFileSync('../../gateway/connection-org1.yaml', 'utf8'));
 
         // Set connection options; identity and wallet
         let connectionOptions = {
             identity: userName,
             wallet: wallet,
             discovery: { enabled: true, asLocalhost: true }
 
         };
 
         // Connect to gateway using application specified parameters
         console.log('Connect to Fabric gateway.');
 
         await gateway.connect(connectionProfile, connectionOptions);
 
         // Access PaperNet network
         console.log('Use network channel: mychannel.');
 
         const network = await gateway.getNetwork('mychannel');
 
         // Get addressability to commercial paper contract
         console.log('Use org.papernet.commercialpaper smart contract.');
 
         const contract = await network.getContract('papercontract', 'org.papernet.commercialpaper');
 
         // queries - commercial paper
         console.log('-----------------------------------------------------------------------------------------');
         console.log('****** Submitting commercial paper queries ****** \n\n ');
 
 
         // 1 asset history
         console.log('1. Query Commercial Paper History....');
         console.log('-----------------------------------------------------------------------------------------\n');
         console.log(req.body);
         let queryResponse2 = await contract.evaluateTransaction('queryOwner', req.body.owner);
         let json = JSON.parse(queryResponse2.toString());
         console.log(json);
         res.json({data:json});
        
         console.log('\n  Named query by "value" complete.');
         console.log('-----------------------------------------------------------------------------------------\n\n');
     } catch (error) {
 
         console.log(`Error processing transaction. ${error}`);
         console.log(error.stack);
 
     } finally {
 
         // Disconnect from the gateway
         console.log('Disconnect from Fabric gateway.');
         gateway.disconnect();
 
     }
});





app.listen(5000, () => {
    console.log('REST Server listening on port 5000');
});
