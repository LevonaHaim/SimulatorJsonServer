import cors from 'cors';
import fs from 'fs';
import jsonServer from 'json-server';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';

const server = jsonServer.create();
const router = jsonServer.router('db.json');
const middlewares = jsonServer.defaults();
server.use(middlewares);
server.use(jsonServer.bodyParser);

const upload = multer({ dest: 'uploads/' });

server.post('/toggle-simulation-status', (req, res) => {
  const { simulationName } = req.body;

  if (!simulationName) {
    return res.status(400).json({ error: 'Invalid request body. Please provide simulationName.' });
  }

  const db = router.db.getState();
  let simulationFound = false;
  let simulationToChange;
  Object.keys(db.simulationsRunning).forEach((type) => {
    db.simulationsRunning[type].forEach((simulationObj) => {
      if (simulationObj.simulation.name === simulationName) {
        simulationObj.isRunning = !simulationObj.isRunning;
        simulationFound = true;
        simulationToChange = simulationObj.simulation;
      }
    });
  });

  Object.keys(db.simulationsRunning).forEach(type => {
    db.simulationsRunning[type].forEach((simulationObj) => {
      if (type == simulationToChange.type && simulationObj.simulation.name != simulationName) {
        simulationObj.isRunning = false
      }
    });
  });

  if (simulationFound) {
    router.db.setState(db);
    fs.writeFileSync('db.json', JSON.stringify(db, null, 2));
    return res.status(200).json({ message: 'Simulation status toggled successfully' });
  } else {
    return res.status(404).json({ error: 'Simulation not found' });
  }
});

server.delete('/api/simulation', (req, res) => {
  const { simulationName } = req.body;

  if (!simulationName) {
    return res.status(400).json({ error: 'Simulation name is required.' });
  }

  const db = router.db.getState();
  let simulationFound = false;

  Object.keys(db.simulationsRunning).forEach((type) => {
    const initialCount = db.simulationsRunning[type].length;

    db.simulationsRunning[type] = db.simulationsRunning[type].filter(
      (simulationObj) => simulationObj.simulation.name !== simulationName
    );

    if (db.simulationsRunning[type].length < initialCount) {
      simulationFound = true;
    }
  });

  if (simulationFound) {
    router.db.setState(db);
    fs.writeFileSync('db.json', JSON.stringify(db, null, 2));
    return res.status(200).json({ message: `Simulation '${simulationName}' deleted successfully.` });
  }
  return res.status(404).json({ error: `Simulation '${simulationName}' not found.` });
});

server.put('/api/simulation/:simulationName', upload.array('files'), (req, res) => {
  const { simulationName } = req.params;
  const updatedSimulation = req.body;
  const files = req.files;

  if (!simulationName) {
    return res.status(400).json({ error: 'Simulation name is required in the path.' });
  }

  const db = router.db.getState();
  let simulationFound = false;

  Object.keys(db.simulationsRunning).forEach((type) => {
    db.simulationsRunning[type].forEach((simulationObj) => {
      if (simulationObj.simulation.name === simulationName) {
        simulationObj.simulation = {
          ...simulationObj.simulation,
          ...updatedSimulation,
        };

        if (files.length > 0) {
          const fileNames = [];

          files.forEach((file) => {
            const destinationPath = path.join(__dirname, 'uploads', file.originalname);
            fs.renameSync(file.path, destinationPath);
            fileNames.push(file.originalname);
          });

          fileNames.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

          simulationObj.simulation.startFileName = fileNames[0];
          simulationObj.simulation.endFileName = fileNames[fileNames.length - 1];
        }

        simulationFound = true;
      }
    });
  });

  if (simulationFound) {
    router.db.setState(db);
    fs.writeFileSync('db.json', JSON.stringify(db, null, 2));

    return res.status(200).json({ message: 'Simulation updated successfully.' });
  } else {
    return res.status(404).json({ error: `Simulation '${simulationName}' not found.` });
  }
});

server.post('/api/simulation', upload.array('files'), (req, res) => {
  const simulationData = req.body;
  const files = req.files;
  console.log(files)
  console.log(simulationData)
  if (!simulationData.name || !simulationData.type) {
    return res.status(400).json({ error: 'Simulation name and type are required.' });
  }

  const db = router.db.getState();
  let simulationAdded = false;

  try {
    files.forEach((file) => {
      const destinationPath = path.join(__dirname, 'uploads', file.originalname);
      fs.renameSync(file.path, destinationPath);
    });

    Object.keys(db.simulationsRunning).forEach((type) => {
      console.log(type);
      if (!simulationAdded && type === simulationData.type) {
        db.simulationsRunning[type].push({
          simulation: {
            name: simulationData.name,
            description: simulationData.description || '',
            startFileName: simulationData.startFileName || '',
            endFileName: simulationData.endFileName || '',
            type: simulationData.type,
          },
          isRunning: false,
        });
        simulationAdded = true;
      }
    });

    if (simulationAdded) {
      router.db.setState(db);
      fs.writeFileSync('db.json', JSON.stringify(db, null, 2));

      return res.status(201).json({ message: 'Simulation added successfully.' });
    } else {
      return res.status(500).json({ error: 'Failed to add simulation to any type.' });
    }
  } catch (error) {
    console.error('Error saving simulation:', error);
    return res.status(500).json({ error: 'Failed to save simulation.' });
  }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

server.get('/api/files', (req, res) => {
  const { simulationName } = req.query;

  if (!simulationName) {
    return res.status(400).json({ error: 'Missing simulationName in request.' });
  }

  const db = router.db.getState();
  let simulation;

  Object.keys(db.simulationsRunning).forEach((type) => {
    db.simulationsRunning[type].forEach((simulationObj) => {
      if (simulationObj.simulation.name === simulationName) {
        simulation = simulationObj.simulation;
      }
    });
  });

  if (!simulation) {
    return res.status(404).json({ error: 'Simulation not found.' });
  }

  const { startFileName, endFileName, type } = simulation;

  if (!startFileName || !endFileName) {
    return res.status(400).json({ error: 'Simulation is missing startFileName or endFileName.' });
  }

  const startFileIndex = parseInt(startFileName.match(/\d+/)?.[0]);
  const endFileIndex = parseInt(endFileName.match(/\d+/)?.[0]);

  if (isNaN(startFileIndex) || isNaN(endFileIndex) || startFileIndex > endFileIndex) {
    return res.status(400).json({ error: 'Invalid file sequence in simulation.' });
  }

  try {
    const files = [];

    for (let i = startFileIndex; i <= endFileIndex; i++) {
      const fileName = `${type}-${i}.json`;
      const filePath = path.join(__dirname, 'uploads', fileName);

      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${fileName}`);
      }

      const fileContent = fs.readFileSync(filePath, 'utf8');
      const mimeType = path.extname(filePath) === '.txt' ? 'text/plain' : 'application/octet-stream';

      files.push({
        fileName,
        content: fileContent,
        mimeType,
      });
    }

    res.status(200).json(files);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch files', details: error.message });
  }
});


server.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

server.use(router);

server.listen(3030, () => {
  console.log('JSON Server is running');
});
