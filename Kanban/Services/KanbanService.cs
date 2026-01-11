using Kanban.Entities;
using Kanban.Repositories;

namespace Kanban.Services
{
    public class KanbanService : IKanbanService
    {
        private readonly IKanbanRepository _kanbanRepository;
        public KanbanService(IKanbanRepository kanbanRepository)
        {
            _kanbanRepository = kanbanRepository;
        }

        public async Task<ServiceResult<Board>> CreateBoard(long userId, string title)
        {
            try
            {
                return ServiceResult<Board>.Ok(await _kanbanRepository.AddBoard(userId, title));
            }
            catch (Exception)
            {
                return ServiceResult<Board>.Fail("Veri tabanında hata oluştu, lütfen tekrar deneyiniz.");
            }
        }

        public async Task<ServiceResult<List<BoardColumn>>> GetBoardColumns_Cards(long userId, long boardId)
        {
            try
            {
                if (!await _kanbanRepository.ValidateBoard(userId, boardId))
                {
                    return ServiceResult<List<BoardColumn>>.Fail("Bu board'a erişim yetkiniz bulunmamaktadır.");
                }

                return ServiceResult<List<BoardColumn>>.Ok(await _kanbanRepository.GetBoardColumns_Cards(boardId));
            }
            catch (Exception)
            {
                return ServiceResult<List<BoardColumn>>.Fail("Veri tabanında hata oluştu, lütfen tekrar deneyiniz.");
            }
        }

        public async Task<ServiceResult<List<Board>>> GetBoards(long userId)
        {
            try
            {
                return ServiceResult<List<Board>>.Ok(await _kanbanRepository.GetBoards(userId));
            }
            catch (Exception)
            {
                return ServiceResult<List<Board>>.Fail("Veri tabanında hata oluştu, lütfen tekrar deneyiniz.");
            }
        }
    }
}
