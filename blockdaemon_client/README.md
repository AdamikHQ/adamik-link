# Builder Vault SDK sandbox
The builder vault SDK sandbox is a demo environment hosted by Blockdaemon, where customers can test out the SDK with a group of shared TSM nodes. 

## Documentation
The documentation is available here: [builder-vault-tsm.docs.blockdaemon.com](https://builder-vault-tsm.docs.blockdaemon.com/docs)

## Contents
This archive contains the following files:
- `main.go`: The sdk example file with a simple CLI that you can use to generate keys and sign messages. Feel free to try anything!
- `client.crt`: Your unique TLS certificate, used by `main.go` to connect to the sandbox cluster.
- `client.key`: Your unique TLS private key, used by `main.go` to connect to the sandbox cluster.
- `go.mod`: The Go dependencies required by the example file

## Getting started

### Setup
Simply run `go mod tidy` to pull the required dependencies and you're good to go!

### Generating a new key
To generate a new key and get back its handle and public key simply run:
```bash
$ go run main.go keygen
```
Example output:
```bash
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
```

### Signing a message
To sign a message using the newly generated key, run:
```bash
$ go run main.go sign ABDB6gK4Gu7zUI1qphDkfQGvp09J "hello world"
```

Example output:
```bash
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
```

### Manually verifying a signature
This doesn't require the Builder Vault SDK, but here's one way to verify the signature using OpenSSL:
```bash
openssl dgst -sha256 -verify <(echo "<public key>" | base64 -d) \
 -signature <(echo "<signature>" | base64 -d) \
 <(echo -n "<message>")
```

Here's the example on the signature generated above:
```bash
$ openssl dgst -sha256 -verify <(echo "MFYwEAYHKoZIzj0CAQYFK4EEAAoDQgAEv7IyQLERmgRS/bOnVnRrQAoPCNJpe78pfHlLnfhfePmDzCetrsncfo4AMJdqDNk/6P00Fpkku4hTniaXvt+1pw==" | base64 -d) \
  -signature <(echo "MEQCIDZC1u6uiakHB4Dr7em6ggGAPRnIJdr0sbAyMUJx0NM1AiBtHi7PbKYqu48rrKt85Jvlt7+kHVNR09wU2wFlR/Ujzw==" | base64 -d) \
  <(echo -n "hello world")
  
Verified OK
```