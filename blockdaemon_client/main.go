package main

import (
	"context"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"fmt"
	"os"
	"sync"

	"gitlab.com/Blockdaemon/go-tsm-sdkv2/v70/tsm"
)

var wg sync.WaitGroup

// Helper functions to get certificate paths with fallback
func getClientKeyPath() string {
	path := os.Getenv("CLIENT_KEY_PATH")
	if path == "" {
		return "./client.key" // Default fallback
	}
	return path
}

func getClientCertPath() string {
	path := os.Getenv("CLIENT_CERT_PATH")
	if path == "" {
		return "./client.crt" // Default fallback
	}
	return path
}

var helpMessage = `Usage: 
This SDK test CLI can be used to perform 3 operations:

1) Key Generation: To generate a new key, which can be used for subsequent signing requests, use the following command:

'go run main.go keygen'

If successful, this will produce an output like:

Starting keygen for client-2
Starting keygen for client-0
Starting keygen for client-1
-------
Node 1: Key created!
Key ID: ABDB6gK4Gu7zUI1qphDkfQGvp09J
public key: MFYwEAYHKoZIzj0CAQYFK4EEAAoDQgAEv7IyQLERmgRS/bOnVnRrQAoPCNJpe78pfHlLnfhfePmDzCetrsncfo4AMJdqDNk/6P00Fpkku4hTniaXvt+1pw==
-------
-------
Node 2: Key created!
Key ID: ABDB6gK4Gu7zUI1qphDkfQGvp09J
public key: MFYwEAYHKoZIzj0CAQYFK4EEAAoDQgAEv7IyQLERmgRS/bOnVnRrQAoPCNJpe78pfHlLnfhfePmDzCetrsncfo4AMJdqDNk/6P00Fpkku4hTniaXvt+1pw==
-------
-------
Node 0: Key created!
Key ID: ABDB6gK4Gu7zUI1qphDkfQGvp09J
public key: MFYwEAYHKoZIzj0CAQYFK4EEAAoDQgAEv7IyQLERmgRS/bOnVnRrQAoPCNJpe78pfHlLnfhfePmDzCetrsncfo4AMJdqDNk/6P00Fpkku4hTniaXvt+1pw==
-------

Take note of the Key ID as this will be needed for use in signing requests that use this key!


2) Message Signing: To sign a message using a key generated with the keygen command, use the following command:

'go run main.go sign <Key Id> <message to sign>'

e.g.:
'go run main.go sign ABDB6gK4Gu7zUI1qphDkfQGvp09J "hello world"'

If successful, this will produce an output like:

Starting signing for client-2
Starting signing for client-0
Starting signing for client-1
-------
Node 1: Message signed!
sig: MEQCIDZC1u6uiakHB4Dr7em6ggGAPRnIJdr0sbAyMUJx0NM1AiBtHi7PbKYqu48rrKt85Jvlt7+kHVNR09wU2wFlR/Ujzw==
key ID: EFRB6gK4Gu7zUI1qphDkfQGvp09J
------
-------
Node 0: Message signed!
sig: MEQCIDZC1u6uiakHB4Dr7em6ggGAPRnIJdr0sbAyMUJx0NM1AiBtHi7PbKYqu48rrKt85Jvlt7+kHVNR09wU2wFlR/Ujzw==
key ID: EFRB6gK4Gu7zUI1qphDkfQGvp09J
------
-------
Node 2: Message signed!
sig: MEQCIDZC1u6uiakHB4Dr7em6ggGAPRnIJdr0sbAyMUJx0NM1AiBtHi7PbKYqu48rrKt85Jvlt7+kHVNR09wU2wFlR/Ujzw==
key ID: EFRB6gK4Gu7zUI1qphDkfQGvp09J
------

3) Public Key Retrieval: To get the public key for an existing key ID, use the following command:

'go run main.go get-pubkey <Key Id>'

e.g.:
'go run main.go get-pubkey ABDB6gK4Gu7zUI1qphDkfQGvp09J'

If successful, this will produce an output like:

Starting public key retrieval for client-0
-------
Node 0: Public key retrieved!
Key ID: ABDB6gK4Gu7zUI1qphDkfQGvp09J
public key: MFYwEAYHKoZIzj0CAQYFK4EEAAoDQgAEv7IyQLERmgRS/bOnVnRrQAoPCNJpe78pfHlLnfhfePmDzCetrsncfo4AMJdqDNk/6P00Fpkku4hTniaXvt+1pw==
-------`

// The public keys of the TSM nodes to authenticate against
// In this example, we centrally connect to each node from a single executable instantiating 3 SDK clients
var serverMtlsPublicKeys = map[int]string{
	0: "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEXIPo/yz9qwQH/sRGkfHJ7lyllde1\nFiHb32Kgd6Y90rOmaZirIqq/gbuV5dPhtmwA/CrMbf5BGD/wc8kD1ryFbQ==\n-----END PUBLIC KEY-----\n",
	1: "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEObRAIt05RL8/u1HqaZtQP0Iv+pOB\nFO7vpTeggHlBgaPuUMejyeCcGSdVGjP2r6+yTce8tcoAUBwgeyJhCM8m+w==\n-----END PUBLIC KEY-----\n",
	2: "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEsPaJGSuo+4+xHZtTrHYhFzJHwTKg\ngdZArd5L4PW0ZHvOtT9GpMzN6GQvh1bYLEPXu9vmawZOwbB1whNWZZ72xA==\n-----END PUBLIC KEY-----\n",
}

// Returns a new session configuration that includes all MPC players taking part in the MPC computation
// Note that players can be dynamically selected to take part in a session, static cluster definition is not required
func newSession(nbPlayers int) tsm.SessionConfig {
	var playerIds []int
	for i := 0; i < nbPlayers; i++ {
		playerIds = append(playerIds, i)
	}

	// The public keys of the other players to encrypt MPC protocol data end-to-end
	playerB64Pubkeys := []string{
		"MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEtDFBfanInAMHNKKDG2RW/DiSnYeI7scVvfHIwUIRdbPH0gBrsilqxlvsKZTakN8om/Psc6igO+224X8T0J9eMg==",
		"MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEqvSkhonTeNhlETse8v3X7g4p100EW9xIqg4aRpD8yDXgB0UYjhd+gFtOCsRT2lRhuqNForqqC+YnBsJeZ4ANxg==",
		"MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEBaHCIiViexaVaPuER4tE6oJE3IBA0U//GlB51C1kXkT07liVc51uWuYk78wi4e1unxC95QbeIfnDCG2i43fW3g==",
	}

	playerPubkeys := map[int][]byte{}

	// iterate over other players public keys and convert them
	for i := range playerIds {
		pubkey, err := base64.StdEncoding.DecodeString(playerB64Pubkeys[i])
		if err != nil {
			panic(err)
		}
		playerPubkeys[playerIds[i]] = pubkey
	}

	// Because we're orchestrating the nodes, we can generate a random session ID centrally
	// and pass it to all nodes in the main function below
	sessionId := tsm.GenerateSessionID()

	return *tsm.NewSessionConfig(sessionId, playerIds, playerPubkeys)
}

// Initiates a key generation operation for the specified node index and prints the key ID and public key
func keygen(index int, session tsm.SessionConfig) {
	defer wg.Done()
	fmt.Printf("Starting keygen for client-%v\n", index)

	// Decodes the PEM encoded public key of the node to authenticate against
	block, rest := pem.Decode([]byte(serverMtlsPublicKeys[index]))
	if block == nil || len(rest) != 0 {
		panic("error decoding server public key (no block data)")
	}
	serverPublicKey, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		panic(err)
	}
	serverPKIXPublicKey, err := x509.MarshalPKIXPublicKey(serverPublicKey)
	if err != nil {
		panic(err)
	}

	nodeUrl := fmt.Sprintf("https://tsm-sandbox.prd.wallet.blockdaemon.app:%v", 8080+index)

	// Creates a new TSM client using the node URL and the client certificate and key
	clientConfig := tsm.Configuration{
		URL: nodeUrl,
	}.WithPublicKeyPinning(serverPKIXPublicKey).WithMTLSAuthentication(getClientKeyPath(), getClientCertPath(), nil)

	client, err := tsm.NewClient(clientConfig)
	if err != nil {
		panic(fmt.Errorf("failed to create TSM client: %w", err))
	}

	// An empty string as desired key name will generate a random one
	keyID, err := client.ECDSA().GenerateKey(context.Background(), &session, 1, "secp256k1", "")
	if err != nil {
		panic(fmt.Errorf("failed to generate key: %w", err))
	}

	// Get the public key for the generated key ID
	ecdsaPublicKey, err := client.ECDSA().PublicKey(context.Background(), keyID, nil)
	if err != nil {
		panic(fmt.Errorf("failed to get public key: %w", err))
	}

	b64pubkey := base64.StdEncoding.EncodeToString(ecdsaPublicKey)

	fmt.Printf("-------\nNode %v: Key created!\nKey ID: %v\npublic key: %v\n-------\n", index, keyID, b64pubkey)
}

// Initiates a signing operation for the specified node index, message and key ID and prints the signature
func sign(index int, keyId, message string, session tsm.SessionConfig, broadcastSession tsm.SessionConfig) {
	defer wg.Done()
	fmt.Printf("Starting signing for client-%v\n", index)

	// Decodes the PEM encoded public key of the node to authenticate against
	block, rest := pem.Decode([]byte(serverMtlsPublicKeys[index]))
	if block == nil || len(rest) != 0 {
		panic("error decoding server public key (no block data)")
	}
	serverPublicKey, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		panic(err)
	}
	serverPKIXPublicKey, err := x509.MarshalPKIXPublicKey(serverPublicKey)
	if err != nil {
		panic(err)
	}

	// Creates a new TSM client using the node URL and the client certificate and key
	clientConfig := tsm.Configuration{
		URL: fmt.Sprintf("https://tsm-sandbox.prd.wallet.blockdaemon.app:%v", 8080+index),
	}.WithPublicKeyPinning(serverPKIXPublicKey).WithMTLSAuthentication(getClientKeyPath(), getClientCertPath(), nil)

	client, err := tsm.NewClient(clientConfig)
	if err != nil {
		panic(err)
	}

	messageHash := sha256.Sum256([]byte(message))
	partialSignResult, err := client.ECDSA().Sign(context.Background(), &session, keyId, nil, messageHash[:])
	if err != nil {
		panic(err)
	}

	// Broadcast the current player's partial signature to all players using the broadcast feature of the TSM SDK
	allPartialSigs, err := client.Broadcast().SimpleBroadcast(context.Background(), &broadcastSession, partialSignResult.PartialSignature)
	if err != nil {
		panic(err)
	}
	var partialSignatures [][]byte
	for i := 0; i < 3; i++ {
		partialSignatures = append(partialSignatures, allPartialSigs[i])

	}

	// Assembling the partial sigs can be done externally to the SDK as well, it doesn't require any MPC node to be online
	// This is done as part of the SDK for convenience here
	signature, err := tsm.ECDSAFinalizeSignature(messageHash[:], partialSignatures)
	if err != nil {
		panic(err)
	}

	// Extract r and s values from the signature
	r, s := signature.R(), signature.S()
	
	fmt.Printf("-------\nNode %v: Message signed!\nr: %x\ns: %x\nKey ID: %v\n------\n", index, r, s, keyId)
}

// Retrieves the public key for an existing key ID
func getPubkey(index int, keyId string) {
	defer wg.Done()
	fmt.Printf("Starting public key retrieval for client-%v\n", index)

	// Decodes the PEM encoded public key of the node to authenticate against
	block, rest := pem.Decode([]byte(serverMtlsPublicKeys[index]))
	if block == nil || len(rest) != 0 {
		panic("error decoding server public key (no block data)")
	}
	serverPublicKey, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		panic(err)
	}
	serverPKIXPublicKey, err := x509.MarshalPKIXPublicKey(serverPublicKey)
	if err != nil {
		panic(err)
	}

	// Creates a new TSM client using the node URL and the client certificate and key
	clientConfig := tsm.Configuration{
		URL: fmt.Sprintf("https://tsm-sandbox.prd.wallet.blockdaemon.app:%v", 8080+index),
	}.WithPublicKeyPinning(serverPKIXPublicKey).WithMTLSAuthentication(getClientKeyPath(), getClientCertPath(), nil)

	client, err := tsm.NewClient(clientConfig)
	if err != nil {
		panic(err)
	}

	// Get the public key for the existing key ID
	ecdsaPublicKey, err := client.ECDSA().PublicKey(context.Background(), keyId, nil)
	if err != nil {
		panic(fmt.Errorf("failed to get public key: %w", err))
	}

	b64pubkey := base64.StdEncoding.EncodeToString(ecdsaPublicKey)

	fmt.Printf("-------\nNode %v: Public key retrieved!\nKey ID: %v\npublic key: %v\n-------\n", index, keyId, b64pubkey)
}

func main() {
	args := os.Args[1:] // Get command line arguments, excluding the program name

	if len(args) < 1 {
		fmt.Println("Error: No function selected. Please provide an arg for either 'keygen', 'sign', 'get-pubkey', or 'help' to see usage.")
		os.Exit(1)
	}

	// each run creates a new session configuration with the same 3 players
	sessionConfig := newSession(3)

	functionSelection := args[0]

	switch functionSelection {

	case "help":
		fmt.Println(helpMessage)

	case "keygen":
		if len(args) != 1 {
			fmt.Println("Error: no arguments are expected when calling the 'keygen' function. > go run main.go keygen")
			os.Exit(1)
		}

		wg.Add(3)
		go keygen(0, sessionConfig)
		go keygen(1, sessionConfig)
		go keygen(2, sessionConfig)
		wg.Wait()

	case "sign":
		if len(args) != 3 {
			fmt.Println("Error: Incorrect number of arguments for 'sign' function. > go run main.go sign <keyId> <message>")
			os.Exit(1)
		}

		broadcastSessionConfig := newSession(3)

		wg.Add(3)
		go sign(0, args[1], args[2], sessionConfig, broadcastSessionConfig)
		go sign(1, args[1], args[2], sessionConfig, broadcastSessionConfig)
		go sign(2, args[1], args[2], sessionConfig, broadcastSessionConfig)
		wg.Wait()

	case "get-pubkey":
		if len(args) != 2 {
			fmt.Println("Error: Incorrect number of arguments for 'get-pubkey' function. > go run main.go get-pubkey <keyId>")
			os.Exit(1)
		}

		wg.Add(1) // Only need one node to get the public key
		go getPubkey(0, args[1]) // Use the first node
		wg.Wait()

	default:
		fmt.Println("Error: Unknown function selection")
		os.Exit(1)
	}
}