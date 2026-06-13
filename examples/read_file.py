#! /usr/bin/python3

from dso5102p.DSO5102P import DSO5102P


def main():
    dso = DSO5102P(0x049f, 0x505a, True)

    print('Listing /*.inf')
    r = dso.remote_shell('ls /*.inf')
    print(r)

    print('Getting keyprotocol.inf')
    r = dso.read_file('/keyprotocol.inf')
    f = open('./inf/keyprotocol.inf', 'w')
    f.write(r)
    f.close()

    print('Getting protocol.inf')
    r = dso.read_file('/protocol.inf')
    f = open('./inf/protocol.inf', 'w')
    f.write(r)
    f.close()

    print('Getting sys.inf')
    r = dso.read_file('/sys.inf')
    f = open('./inf/sys.inf', 'w')
    f.write(r)
    f.close()


# show time
main()
