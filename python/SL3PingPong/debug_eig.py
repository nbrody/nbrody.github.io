import flint
from flint import arb_mat, acb_mat

def test_eig():
    print("Testing eig()...")
    m = arb_mat([[0,1,0],[1,0,-1],[0,-1,-1]])
    try:
        res = m.eig()
        print(f"Result type: {type(res)}")
        print(f"Result length: {len(res) if hasattr(res, '__len__') else 'N/A'}")
        for i, item in enumerate(res):
            print(f"Item {i} type: {type(item)}")
            # print(f"Item {i} content: {item}")
    except Exception as e:
        print(f"Error calling eig: {e}")

    print("\nTesting eig(right=True)...")
    try:
        res = m.eig(right=True)
        print(f"Result type: {type(res)}")
        print(f"Result length: {len(res)}")
        for i, item in enumerate(res):
            print(f"Item {i} type: {type(item)}")
    except Exception as e:
        print(f"Error calling eig(right=True): {e}")

if __name__ == "__main__":
    test_eig()
