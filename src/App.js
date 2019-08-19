import React from 'react';
import './App.css';
import io from 'socket.io-client';
import uuidv4 from 'uuid/v4';
import Peer from 'simple-peer';
import GetUserMedia from 'getusermedia';

const SERVER = 'http://localhost:3001';

class App extends React.Component {
  
  constructor(props) {
    super(props);
  
    this.state = {
      connected: false,
      connecting: false,
      id: uuidv4(),
      alias: 'tester1',
      clients: []
    }
    // Reference to my video object in order to set srcObject
    this.myVideoRef = React.createRef();
    // P2P connect method binding
    this.connect = this.connect.bind(this);
    this.clearRooms = this.clearRooms.bind(this);
    // Listen to text updates
    this.handleAliasChange = this.handleAliasChange.bind(this);
  }

  handleAliasChange(event) {
    this.setState({alias: event.target.value});
  }

  /**
   * Method to register offers with room server
   * @param {WebRTCOffer} peerOffer - WebRTC Offer
   */
  async register(peerOffer) {
    if (this.state.connected && peerOffer) {
      this.socket.emit('register', {
        id: this.state.id,
        alias: this.state.alias,
        peerOffer
      });
    } else {
      console.warn('Unable to send peer metadata');
    }
  }

  /**
   * Method to disconnect from room server
   */
  async disconnect() {
    if (this.state.connected) {
      this.socket.disconnect(this.state.clientId);
    }
  }

  /**
   * Establish connection to the room server for signalling and session broadcast metadata
   */
  async broadcast() {
    this.socket = io(SERVER);

    // Connect to room server and set state
    this.socket.on('connect', () => {
      this.setState({
        connected: true,
        connecting: true
      });
    });

    // Listening to inbound WebRTC signalling
    this.socket.on('signalling', data => {
      
      if (data.client.id === this.state.id) {
        this.state.peer.signal(data.peerAnswer);
        console.log('signalling', this.state.peer);
      }
    });

    // Listening for all known public broadcasts (WebRTC Offers)
    this.socket.on('clients', clients => {
      this.setState({
        clients
      });
    });

    // Listen for room server disconnects
    this.socket.on('disconnect', () => {
      this.setState({
        connected: false
      })
    });
  }

  /**
   * Sets up a P2P connection to an existing broadcasting WebRTC peer (Answer) or establish a new
   * WebRTC broadcast (Offer). If the p2pclient object is offer is provided, begin signaling and send 
   * WebRTC answer object to client.
   * @param {WebRTCOffer} p2pclient - WebRTC Offer object
   */
  async connect(p2pclient) {
    await this.configurePeering(!p2pclient);

    // Send answer to P2P client broadcaster
    if (p2pclient) {
      this.setState({
        client: p2pclient
      })
      console.log('state', this.state);
      console.log('client', p2pclient);
      this.state.peer.signal(p2pclient.peerOffer);
    }
  }

  /**
   * Temporary method to clear server rooms
   */
  async clearRooms() {
    
    if (this.state.connected) {
      console.log('clearing rooms');
      this.socket.emit('clearRooms');
    } else {
      console.warn('Unable to clear rooms.');
    }
  }

  /**
   * Method setups up WebRTC peer as either an WebRTC Offer or WebRTC Answer depending on the initiator boolean.
   * @param {Boolen} initiator - Boolen used to determine peer type to initialize
   */
  async configurePeering(initiator) {
    // Init Peer
    let peer = new Peer({
      initiator,
      stream: this.state.stream
    });
    // Set peer in state for later reference
    this.setState({
      peer
    });
    // Listen to connections
    peer.on('connect', () => {
      console.log('connected to peer via webrtc');
    })
    
    // Listen to signalling coming from clients
    peer.on('signal', peering => {

      if (peering && peering.type === 'offer') {
        this.setState({
          peerOffer: peering
        });

        // Register "room" with the room server since this is a broadcast (WebRTC Offer)
        this.register(peering);
      } else if (peering && peering.type === 'answer') {
        // Begin signalling with client/broadcaster (WebRTC Offer) with local WebRTC answer
        this.socket.emit('signalling', {
          client: this.state.client,
          peerAnswer: peering
        });
      } else {
        console.log('Unhandled Signal', peering);
      }
      
    });

    // Listen for incoming streams and inject them in to page
    peer.on('stream',  stream => {
      console.log('Recieving stream');
      var video = document.createElement('video')
      let theirVideoElement = document.getElementById('their-videos');
      theirVideoElement.appendChild(video);
      video.srcObject = stream;
      video.play();
    })
  }

  /**
   * ComponentDidMount - Connects to services to listen for broadcasted rooms and inits local video stream.
   */
  componentDidMount() {
    this.broadcast();

    GetUserMedia({ video: true, audio: true }, 
      (error, stream) => {
        this.setState({
          stream
        });
        this.myVideoRef.current.srcObject = stream;
        this.myVideoRef.current.play();
      }
    );

  }

  render() {
    return (
      <div>
        <strong>Status:</strong> { (this.state.connected) ? 'Connected' : 'Disconnected' } <br />
        <strong>ID: </strong> { this.state.id } <br />
        <strong>Alias: </strong><input type="text" value={this.state.alias} onChange={this.handleAliasChange} /> <br />
        <button onClick={ () => { this.connect() }}>
          Create Room
        </button> 
        <button onClick={ () => { this.clearRooms() }}>
          Clear Rooms
        </button> 
        <h1>Known Clients</h1> <br />
        <ul>
          { this.state.clients.map( client => {
            return (
            <li key={client.id}> 
              <a href="#" onClick={ () => { this.connect(client) } }>{client.alias} </a>
            </li>);
          })}
        </ul>
        <h1>My Video</h1>
        <video id="my-video" ref={this.myVideoRef}></video> <br />
        <h1>Their Video</h1>
        <div id="their-videos">

        </div>
      </div>
    );
  }
}

export default App;
