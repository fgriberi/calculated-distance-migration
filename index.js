(function() {
  const MongoClient = require('mongodb').MongoClient;
  const assert = require('assert');
  const axios = require('axios');

  // Connection URL
  const url = 'mongodb://127.0.0.1:27017';

  const google_key = null;

  if (!google_key) {
    console.log('return not found');
    return;
  }

  // Database Name
  const dbName = 'delivery_gig';

  // Use connect method to connect to the server
  MongoClient.connect(url, async function(err, client) {
    assert.equal(null, err);
    console.log('Connected successfully to server');

    const db = client.db(dbName);

    const getDistance = async function(job) {
      const from = encodeURI(job.pickUpLocation.formatted_address);
      const to = encodeURI(job.deliveryLocation.formatted_address);
      const apiUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?units=imperial&origins=${from}&destinations=${to}&key=${google_key}`;

      return axios
        .get(apiUrl)
        .then(response => {
          const json = response.data;
          const {
            distance: { text: textInMiles }
          } = json.rows[0].elements[0];
          const numberOfMiles = (textInMiles || '').split(' ')[0];
          return numberOfMiles;
        })
        .catch(error => {
          console.log(error);
        });
    };

    const query = { calculatedDistance: { $exists: false } };

    const bulk = db.collection('jobs').initializeUnorderedBulkOp();

    db.collection('jobs')
      .find(query)
      .toArray(async function(err, result) {
        if (err) throw err;
        const jobs = result;

        try {
          await Promise.all(
            jobs.map(async job => {
              if (job.calculatedDistance) return;
              const distance = await getDistance(job);
              console.log('TCL: job id', job._id);
              console.log('TCL: distance', distance);

              const updatedSet = { calculatedDistance: parseFloat(distance) };
              bulk.find({ _id: job._id }).update({ $set: updatedSet });
            })
          );
          if (bulk.length > 0) {
            // run bulk operations
            bulk.execute();
          }
          client.close();
        } catch (error) {
          console.log('TCL: error', error);
        }
      });
  });
})();
